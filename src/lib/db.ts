/*
  DB Worker RPC client
*/
import { Task, CalendarSource, Stage } from '@/types';

type WorkerMsg =
  | { id: string; type: 'init' }
  | { id: string; type: 'migrate' }
  | { id: string; type: 'run'; sql: string; params?: unknown[] }
  | { id: string; type: 'all'; sql: string; params?: unknown[] };

type WorkerResp<T = unknown> =
  | { id: string; ok: true; result?: T }
  | { id: string; ok: false; error: string };

let worker: Worker | null = null;
let ready = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/db.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

function call<T = unknown>(msg: WorkerMsg): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const w = getWorker();
    const handler = (e: MessageEvent<WorkerResp<T>>) => {
      const res = e.data;
      if (res.id !== msg.id) return;
      w.removeEventListener('message', handler as EventListener);
      if (res.ok) resolve((res as any).result as T);
      else reject(new Error(res.error));
    };
    w.addEventListener('message', handler as EventListener);
    w.postMessage(msg);
  });
}

async function ensureReady() {
  if (ready) return;
  const id1 = crypto.randomUUID();
  await call({ id: id1, type: 'init' });
  const id2 = crypto.randomUUID();
  await call({ id: id2, type: 'migrate' });
  ready = true;
}

// Utilities to marshal Task rows
function rowToTask(row: any): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ?? undefined,
    stage: row.stage as Stage,
    checked: !!row.checked,
    start: row.start ?? undefined,
    end: row.end ?? undefined,
    allDay: row.allDay != null ? !!row.allDay : undefined,
    isEvent: !!row.isEvent,
    hiddenOnCalendar: !!row.hiddenOnCalendar,
    linkedTo: row.linkedTo ? JSON.parse(row.linkedTo) : undefined,
    parentId: row.parentId ?? undefined,
    subTasks: row.subTasks ? JSON.parse(row.subTasks) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    calendarId: String(row.calendarId),
    order: typeof row.sortOrder === 'number' ? row.sortOrder : (typeof row.order === 'number' ? row.order : undefined),
  };
}

function taskToDB(task: Partial<Task>): { cols: string[]; vals: unknown[]; placeholders: string[] } {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const placeholders: string[] = [];
  const push = (c: string, v: unknown) => { cols.push(c); vals.push(v); placeholders.push('?'); };
  for (const [k, v] of Object.entries(task)) {
    if (v === undefined) continue;
    switch (k) {
      case 'id':
        // id is handled separately
        break;
      case 'linkedTo': push('linkedTo', JSON.stringify(v)); break;
      case 'subTasks': push('subTasks', JSON.stringify(v)); break;
      case 'checked': push('checked', v ? 1 : 0); break;
      case 'allDay': push('allDay', v ? 1 : 0); break;
      case 'isEvent': push('isEvent', v ? 1 : 0); break;
      case 'hiddenOnCalendar': push('hiddenOnCalendar', v ? 1 : 0); break;
      case 'order': push('sortOrder', v as number); break;
      default: push(k, v as any); break;
    }
  }
  return { cols, vals, placeholders };
}

export const db = {
  async createTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task> {
    await ensureReady();
    const now = new Date().toISOString();
    const full: Task = { ...task, createdAt: now, updatedAt: now };
    const { cols, vals, placeholders } = taskToDB(full);
    const id = crypto.randomUUID();
    cols.unshift('id');
    vals.unshift(id);
    placeholders.unshift('?');
    const sql = `INSERT INTO tasks(${cols.join(',')}) VALUES(${placeholders.join(',')})`;
    await call({ id: crypto.randomUUID(), type: 'run', sql, params: vals });
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE id = ?', params: [id] });
    return rowToTask(rows[0]);
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    await ensureReady();
    const p = { ...patch, updatedAt: new Date().toISOString() } as Partial<Task>;
    const { cols, vals } = taskToDB(p);
    if (cols.length === 0) {
      const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE id = ?', params: [id] });
      return rowToTask(rows[0]);
    }
    const sets = cols.map((c) => `${c} = ?`).join(',');
    const sql = `UPDATE tasks SET ${sets} WHERE id = ?`;
    await call({ id: crypto.randomUUID(), type: 'run', sql, params: [...vals, id] });
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE id = ?', params: [id] });
    return rowToTask(rows[0]);
  },

  async deleteTask(id: string): Promise<void> {
    await ensureReady();
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'DELETE FROM tasks WHERE id = ?', params: [id] });
  },

  async listTasks(): Promise<Task[]> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks ORDER BY createdAt ASC', params: [] });
    return rows.map(rowToTask);
  },

  async listEventsInRange(from: string, to: string): Promise<Task[]> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE isEvent = 1 AND start IS NOT NULL AND end IS NOT NULL AND ((start <= ? AND end >= ?) OR (start >= ? AND start <= ?))', params: [to, from, from, to] });
    return rows.map(rowToTask);
  },

  async listTasksInRange(from: string, to: string): Promise<Task[]> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE (start IS NULL OR end IS NULL) OR ((start <= ? AND end >= ?) OR (start >= ? AND start <= ?))', params: [to, from, from, to] });
    return rows.map(rowToTask);
  },

  async listCalendars(): Promise<CalendarSource[]> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM calendars ORDER BY id', params: [] });
    return rows.map((r) => ({ id: String(r.id), title: String(r.title), enabled: !!r.enabled, readOnly: !!r.readOnly, kind: r.kind as CalendarSource['kind'] }));
  },

  async toggleCalendarEnabled(id: string, enabled: boolean): Promise<void> {
    await ensureReady();
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE calendars SET enabled = ? WHERE id = ?', params: [enabled ? 1 : 0, id] });
  },
};
