import { create } from 'zustand';
import { db } from '@/lib/db';
import { addDays, addHours } from 'date-fns';
import { CalendarSource, Stage, Task } from '@/types';

type State = {
  tasks: Record<string, Task>;
  calendars: CalendarSource[];
  selectedTaskId?: string | null;
  initialized: boolean;
  search: string;
  hideDone: boolean;
};

type Actions = {
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setSelected: (id: string | null) => void;
  setSearch: (q: string) => void;
  setHideDone: (v: boolean) => void;
  toggleHideDone: () => void;
  createTask: (input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  moveStage: (id: string, stage: Stage, beforeId?: string, afterId?: string) => Promise<void>;
  toggleChecked: (id: string) => Promise<void>;
  toggleIsEvent: (id: string) => Promise<void>;
  toggleCalendarEnabled: (calendarId: string, enabled: boolean) => Promise<void>;
  createFollowUp: (id: string) => Promise<Task>;
  tasksByStage: (stage: Stage) => Task[];
};

export const useStore = create<State & Actions>((set, get) => ({
  tasks: {},
  calendars: [],
  selectedTaskId: null,
  initialized: false,
  search: '',
  hideDone: false,

  init: async () => {
    // Load preference
    try { const saved = localStorage.getItem('clarity:hide-done'); if (saved != null) set({ hideDone: saved === '1' }); } catch {}
    await get().refresh();
    set({ initialized: true });
  },

  refresh: async () => {
    const [tasks, calendars] = await Promise.all([db.listTasks(), db.listCalendars()]);
    const map: Record<string, Task> = {};
    for (const t of tasks) {
      // Migrate any legacy 'in-progress' to 'todo'
      if ((t as any).stage === 'in-progress') {
        const migrated = { ...t, stage: 'todo' as Stage };
        map[t.id] = migrated;
        void db.updateTask(t.id, { stage: 'todo' as Stage }).catch(() => {});
      } else {
        map[t.id] = t;
      }
    }
    set({ tasks: map, calendars });
  },

  setSelected: (id) => set({ selectedTaskId: id }),

  setSearch: (q) => set({ search: q }),

  setHideDone: (v) => { set({ hideDone: v }); try { localStorage.setItem('clarity:hide-done', v ? '1' : '0'); } catch {} },
  toggleHideDone: () => { const v = !get().hideDone; set({ hideDone: v }); try { localStorage.setItem('clarity:hide-done', v ? '1' : '0'); } catch {} },

  createTask: async (input) => {
    const task = await db.createTask(input as any);
    set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
    return task;
  },

  updateTask: async (id, patch) => {
    const t = await db.updateTask(id, patch);
    set((s) => ({ tasks: { ...s.tasks, [id]: t } }));
    return t;
  },

  deleteTask: async (id) => {
    await db.deleteTask(id);
    set((s) => {
      const copy = { ...s.tasks };
      delete copy[id];
      return { tasks: copy };
    });
  },

  moveStage: async (id, stage, beforeId, afterId) => {
    // simple reordering by average order or by createdAt fallback
    const state = get();
    const list = Object.values(state.tasks).filter((t) => t.stage === stage && t.id !== id).sort(orderComparator);
    let beforeOrder = beforeId ? state.tasks[beforeId]?.order ?? undefined : undefined;
    let afterOrder = afterId ? state.tasks[afterId]?.order ?? undefined : undefined;
    if (beforeId && beforeOrder === undefined) beforeOrder = list.find((t) => t.id === beforeId)?.order;
    if (afterId && afterOrder === undefined) afterOrder = list.find((t) => t.id === afterId)?.order;
    let nextOrder: number | undefined;
    if (beforeOrder != null && afterOrder != null) nextOrder = (beforeOrder + afterOrder) / 2;
    else if (beforeOrder != null) nextOrder = beforeOrder - 1;
    else if (afterOrder != null) nextOrder = afterOrder + 1;
    else nextOrder = list.length > 0 ? (list[list.length - 1].order ?? list.length) + 1 : 0;
    await get().updateTask(id, { stage, order: nextOrder });
  },

  toggleChecked: async (id) => {
    const t = get().tasks[id];
    if (!t) return;
    const checked = !t.checked;
    const patch: Partial<Task> = { checked };
    if (checked) patch.stage = 'done';
    else if (!checked && t.stage === 'done') patch.stage = 'todo';
    await get().updateTask(id, patch);
  },

  toggleIsEvent: async (id) => {
    const t = get().tasks[id];
    if (!t) return;
    const isEvent = !t.isEvent;
    let patch: Partial<Task> = { isEvent };
    if (isEvent && !t.start) {
      const now = new Date();
      patch = { ...patch, start: now.toISOString(), end: addHours(now, 1).toISOString() };
    }
    await get().updateTask(id, patch);
  },

  toggleCalendarEnabled: async (calendarId, enabled) => {
    await db.toggleCalendarEnabled(calendarId, enabled);
    await get().refresh();
  },

  createFollowUp: async (id) => {
    const original = get().tasks[id];
    if (!original) throw new Error('Task not found');
    const start = original.start ? addDays(new Date(original.start), 1) : undefined;
    const end = original.end ? addDays(new Date(original.end), 1) : (start ? addHours(start, 2) : undefined);
    const follow: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      title: original.title,
      description: original.description,
      stage: original.stage,
      checked: false,
      start: start?.toISOString(),
      end: end?.toISOString(),
      allDay: original.allDay,
      isEvent: original.isEvent,
      hiddenOnCalendar: original.hiddenOnCalendar,
      linkedTo: [original.id, ...(original.linkedTo ?? [])],
      parentId: original.parentId ?? original.id,
      subTasks: original.subTasks,
      calendarId: original.calendarId,
      order: (original.order ?? 0) + 0.1,
    };
    const created = await get().createTask(follow);
    // link both ways
    await get().updateTask(original.id, { linkedTo: [...new Set([...(original.linkedTo ?? []), created.id])] });
    return created;
  },

  tasksByStage: (stage) => {
    return Object.values(get().tasks).filter((t) => t.stage === stage).sort(orderComparator);
  },
}));

function orderComparator(a: Task, b: Task): number {
  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  if (ao !== bo) return ao - bo;
  return a.createdAt.localeCompare(b.createdAt);
}
