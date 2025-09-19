/*
  DB Worker RPC client
*/
import { Task, CalendarSource, Stage, TaskRange } from '@/types';

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
  if (!ready) {
    const id1 = crypto.randomUUID();
    await call({ id: id1, type: 'init' });
    const id2 = crypto.randomUUID();
    await call({ id: id2, type: 'migrate' });
    ready = true;
  } else {
    // Verify critical migrations (e.g., 'completedAt') are applied even if this module
    // was initialized before the code changed (dev HMR / long-lived session)
    try {
      const cols = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'PRAGMA table_info(tasks);', params: [] });
      const hasCompletedAt = Array.isArray(cols) && cols.some((r: any) => String(r.name || '') === 'completedAt');
      if (!hasCompletedAt) {
        await call({ id: crypto.randomUUID(), type: 'migrate' });
      }
    } catch {
      // If PRAGMA fails for any reason, attempt a migrate
      try { await call({ id: crypto.randomUUID(), type: 'migrate' }); } catch {}
    }
  }
}

// Utilities to marshal Task rows
function rowToTask(row: any): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ?? undefined,
    stage: row.stage as Stage,
    checked: !!row.checked,
    completedAt: row.completedAt ?? undefined,
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
      case 'completedAt': push('completedAt', v as any); break;
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
    // If a start/end was provided, also create a range row for timeline support
    try {
      if (full.start && full.end) {
        const rid = crypto.randomUUID();
        const now2 = new Date().toISOString();
        await call({ id: crypto.randomUUID(), type: 'run', sql: 'INSERT INTO task_ranges(id, taskId, start, end, allDay, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)', params: [rid, id, full.start, full.end, full.allDay ? 1 : 0, now2, now2] });
      }
    } catch {}
    // Return with ranges attached
    return await this.getTask(id);
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    await ensureReady();
    const p = { ...patch, updatedAt: new Date().toISOString() } as Partial<Task>;
    const { cols, vals } = taskToDB(p);
    if (cols.length === 0) {
      return await this.getTask(id);
    }
    const sets = cols.map((c) => `${c} = ?`).join(',');
    const sql = `UPDATE tasks SET ${sets} WHERE id = ?`;
    try {
      await call({ id: crypto.randomUUID(), type: 'run', sql, params: [...vals, id] });
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes('no such column') && msg.includes('completedat')) {
        try { await call({ id: crypto.randomUUID(), type: 'migrate' } as any); } catch {}
        await call({ id: crypto.randomUUID(), type: 'run', sql, params: [...vals, id] });
      } else {
        throw err as Error;
      }
    }
    // Keep task_ranges in sync for single-range cases
    try {
      const hasTimePatch = Object.prototype.hasOwnProperty.call(p, 'start') || Object.prototype.hasOwnProperty.call(p, 'end') || Object.prototype.hasOwnProperty.call(p, 'allDay');
      if (hasTimePatch) {
        const ranges = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges WHERE taskId = ? ORDER BY start ASC', params: [id] });
        const start = (p as any).start as string | undefined;
        const end = (p as any).end as string | undefined;
        const allDay = (p as any).allDay as boolean | undefined;
        if (ranges.length === 0) {
          if (start && end) {
            const rid = crypto.randomUUID();
            const now2 = new Date().toISOString();
            await call({ id: crypto.randomUUID(), type: 'run', sql: 'INSERT INTO task_ranges(id, taskId, start, end, allDay, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)', params: [rid, id, start, end, allDay ? 1 : 0, now2, now2] });
          }
        } else if (ranges.length === 1) {
          const r = ranges[0] as any;
          const nextStart = start ?? String(r.start);
          const nextEnd = end ?? String(r.end);
          const nextAll = allDay != null ? (allDay ? 1 : 0) : (r.allDay ? 1 : 0);
          await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE task_ranges SET start = ?, end = ?, allDay = ?, updatedAt = ? WHERE id = ?', params: [nextStart, nextEnd, nextAll, new Date().toISOString(), String(r.id)] });
        } else {
          // Multiple ranges exist: do not implicitly add another range via updateTask.
          // Range additions must go through addRange to avoid accidental duplicates.
        }
      }
    } catch {}
    return await this.getTask(id);
  },

  async deleteTask(id: string): Promise<void> {
    await ensureReady();
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'DELETE FROM tasks WHERE id = ?', params: [id] });
  },

  async listTasks(): Promise<Task[]> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks ORDER BY createdAt ASC', params: [] });
    const tasks = rows.map(rowToTask);
    try {
      const tr = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges ORDER BY start ASC', params: [] });
      const byTask: Record<string, TaskRange[]> = {};
      for (const r of tr) {
        const item: TaskRange = { id: String(r.id), taskId: String(r.taskId), start: String(r.start), end: String(r.end), allDay: !!r.allDay, createdAt: r.createdAt, updatedAt: r.updatedAt };
        (byTask[item.taskId] ||= []).push(item);
      }
      for (const t of tasks) {
        if (byTask[t.id]?.length) t.ranges = byTask[t.id];
      }
    } catch {}
    return tasks;
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

  async listCompletedInRange(from: string, to: string): Promise<Task[]> {
    await ensureReady();
    try {
      const rows = await call<any[]>({
        id: crypto.randomUUID(),
        type: 'all',
        sql: `
          SELECT * FROM tasks
          WHERE checked = 1 AND (
            (completedAt IS NOT NULL AND completedAt >= ? AND completedAt <= ?)
            OR (completedAt IS NULL AND updatedAt >= ? AND updatedAt <= ?)
          )
          ORDER BY COALESCE(completedAt, updatedAt) ASC
        `,
        params: [from, to, from, to],
      });
      return rows.map(rowToTask);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes('no such column') && msg.includes('completedat')) {
        // Attempt a migration and retry once
        try { await call({ id: crypto.randomUUID(), type: 'migrate' } as any); } catch {}
        try {
          const rows = await call<any[]>({
            id: crypto.randomUUID(),
            type: 'all',
            sql: `
              SELECT * FROM tasks
              WHERE checked = 1 AND (
                (completedAt IS NOT NULL AND completedAt >= ? AND completedAt <= ?)
                OR (completedAt IS NULL AND updatedAt >= ? AND updatedAt <= ?)
              )
              ORDER BY COALESCE(completedAt, updatedAt) ASC
            `,
            params: [from, to, from, to],
          });
          return rows.map(rowToTask);
        } catch {}
        // Fallback query without referencing completedAt
        const rows = await call<any[]>({
          id: crypto.randomUUID(),
          type: 'all',
          sql: 'SELECT * FROM tasks WHERE checked = 1 AND updatedAt >= ? AND updatedAt <= ? ORDER BY updatedAt ASC',
          params: [from, to],
        });
        return rows.map(rowToTask);
      }
      throw err as Error;
    }
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
  
  // --- Ranges (timeline) ---
  async getTask(id: string): Promise<Task> {
    await ensureReady();
    const rows = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM tasks WHERE id = ?', params: [id] });
    const t = rowToTask(rows[0]);
    try {
      const tr = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges WHERE taskId = ? ORDER BY start ASC', params: [id] });
      if (tr.length) {
        t.ranges = tr.map((r: any) => ({ id: String(r.id), taskId: String(r.taskId), start: String(r.start), end: String(r.end), allDay: !!r.allDay, createdAt: r.createdAt, updatedAt: r.updatedAt }));
      }
    } catch {}
    return t;
  },

  async addRange(taskId: string, input: { start: string; end: string; allDay?: boolean }): Promise<Task> {
    await ensureReady();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'INSERT INTO task_ranges(id, taskId, start, end, allDay, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)', params: [id, taskId, input.start, input.end, input.allDay ? 1 : 0, now, now] });
    // Keep task.start/end in sync to represent last added range
    try { await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE tasks SET start = ?, end = ?, allDay = ?, updatedAt = ? WHERE id = ?', params: [input.start, input.end, input.allDay ? 1 : 0, now, taskId] }); } catch {}
    return await this.getTask(taskId);
  },

  async updateRange(rangeId: string, patch: Partial<Pick<TaskRange, 'start'|'end'|'allDay'>>): Promise<Task> {
    await ensureReady();
    const row = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges WHERE id = ?', params: [rangeId] });
    if (!row[0]) throw new Error('Range not found');
    const taskId = String(row[0].taskId);
    const nextStart = patch.start ?? String(row[0].start);
    const nextEnd = patch.end ?? String(row[0].end);
    const nextAll = patch.allDay != null ? (patch.allDay ? 1 : 0) : (row[0].allDay ? 1 : 0);
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE task_ranges SET start = ?, end = ?, allDay = ?, updatedAt = ? WHERE id = ?', params: [nextStart, nextEnd, nextAll, new Date().toISOString(), rangeId] });
    // Heuristic: mirror edited range onto task.start/end
    try { await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE tasks SET start = ?, end = ?, allDay = ?, updatedAt = ? WHERE id = ?', params: [nextStart, nextEnd, nextAll, new Date().toISOString(), taskId] }); } catch {}
    return await this.getTask(taskId);
  },

  async deleteRange(rangeId: string): Promise<Task> {
    await ensureReady();
    const row = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges WHERE id = ?', params: [rangeId] });
    const taskId = row[0] ? String(row[0].taskId) : '';
    await call({ id: crypto.randomUUID(), type: 'run', sql: 'DELETE FROM task_ranges WHERE id = ?', params: [rangeId] });
    // Update task.start/end to latest remaining range or clear
    try {
      const remaining = await call<any[]>({ id: crypto.randomUUID(), type: 'all', sql: 'SELECT * FROM task_ranges WHERE taskId = ? ORDER BY start DESC', params: [taskId] });
      if (remaining[0]) {
        const r = remaining[0];
        await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE tasks SET start = ?, end = ?, allDay = ?, updatedAt = ? WHERE id = ?', params: [String(r.start), String(r.end), (r.allDay ? 1 : 0), new Date().toISOString(), taskId] });
      } else {
        await call({ id: crypto.randomUUID(), type: 'run', sql: 'UPDATE tasks SET start = NULL, end = NULL, updatedAt = ? WHERE id = ?', params: [new Date().toISOString(), taskId] });
      }
    } catch {}
    return await this.getTask(taskId);
  },
};
