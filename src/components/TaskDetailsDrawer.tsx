'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store';
import { toast } from '@/lib/toast';
import { Task, SubTask, Stage } from '@/types';
import { format, isSameDay, isSameYear, isToday, isTomorrow, isYesterday, isWithinInterval, differenceInMinutes } from 'date-fns';
import { Trash2, Copy, X, Plus, Zap, Loader2 } from 'lucide-react';
import DateTimePicker from '@/components/DateTimePicker';
import { SUBTASKS_SYSTEM_PROMPT } from '@/lib/prompts';
import { LS_AI_KEY, LS_AI_MODEL, DEFAULT_MODEL_ID } from '@/lib/ai';

type Props = { open: boolean; taskId?: string | null; highlightRangeId?: string; onClose: () => void };

// Colors removed

export default function TaskDetailsDrawer({ open, taskId, highlightRangeId, onClose }: Props) {
  const task = useStore((s) => (taskId ? s.tasks[taskId] : undefined));
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const createTask = useStore((s) => s.createTask);

  const [local, setLocal] = useState<Task | undefined>(task);
  const [saving, setSaving] = useState<'idle'|'saving'|'saved'>('idle');
  const lastSaved = useRef<string>('');
  // Only reset local state when switching tasks; avoid overriding while typing
  useEffect(() => setLocal(task), [taskId]);

  // initialize lastSaved signature when opening or task changes
  useEffect(() => {
    if (task) {
      lastSaved.current = JSON.stringify(sanitize(task));
    }
  }, [taskId]);

  const linked = useMemo(() => {
    if (!task) return [] as Task[];
    const map = useStore.getState().tasks;
    return (task.linkedTo ?? []).map((id) => map[id]).filter(Boolean);
  }, [task]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Broadcast live title while editing (for calendar creation overlay)
  useEffect(() => {
    if (!open || !task || !local) return;
    try { window.dispatchEvent(new CustomEvent('task-editing-title', { detail: { id: task.id, title: local.title } })); } catch {}
  }, [open, task?.id, local?.title]);

  // Prevent immediate close from the same click that opened the drawer
  const [closeArmed, setCloseArmed] = useState(false);
  useEffect(() => {
    if (!open) { setCloseArmed(false); return; }
    const id = window.setTimeout(() => setCloseArmed(true), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Debounced autosave on local changes
  useEffect(() => {
    if (!open || !task || !local) return;
    const patch = sanitize(local);
    const sig = JSON.stringify(patch);
    if (sig === lastSaved.current) return;
    const timer = setTimeout(async () => {
      try {
        setSaving('saving');
        await updateTask(task.id, patch);
        lastSaved.current = sig;
        setSaving('saved');
        setTimeout(() => setSaving('idle'), 1000);
      } catch {
        setSaving('idle');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, task?.id, local, updateTask]);

  // Do not early return based on `open` to keep Hooks order stable across renders.

  const commit = async () => {
    if (!task || !local) return;
    await updateTask(task.id, sanitize(local));
    onClose();
  };

  const remove = async () => {
    if (!task) return;
    const ok = window.confirm('Delete this task? This action cannot be undone.');
    if (!ok) return;
    await deleteTask(task.id);
    toast('Task deleted.');
    onClose();
  };

  const duplicate = async () => {
    const copy = { ...task } as Task;
    const created = await createTask({
      title: copy.title + ' (copy)',
      description: copy.description,
      stage: copy.stage,
      checked: false,
      start: copy.start,
      end: copy.end,
      allDay: copy.allDay,
      isEvent: copy.isEvent,
      hiddenOnCalendar: copy.hiddenOnCalendar,
      linkedTo: copy.linkedTo,
      parentId: copy.parentId ?? null,
      subTasks: copy.subTasks,
      calendarId: copy.calendarId,
    } as any);
    toast('Task duplicated.');
    onClose();
  };

  // Slide-in/out animation helpers
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = 'translateX(100%)';
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = 'transform 220ms ease, opacity 220ms ease';
      el.style.transform = 'translateX(0)';
      el.style.opacity = '1';
      setTimeout(() => { if (el) el.style.transition = ''; }, 260);
    });
  }, [open, taskId]);

  const closeWithAnimation = async () => {
    if (!closeArmed) return;
    const el = panelRef.current;
    const savePromise = task && local ? updateTask(task.id, sanitize(local)).catch(() => {}) : Promise.resolve();
    if (el) {
      el.style.transition = 'transform 200ms ease, opacity 200ms ease';
      el.style.transform = 'translateX(100%)';
      el.style.opacity = '0';
      setTimeout(() => onClose(), 220);
    } else {
      onClose();
    }
    void savePromise;
    try { if (task) window.dispatchEvent(new CustomEvent('task-editing-done', { detail: { id: task.id, title: (sanitize(local || task).title ?? '') } })); } catch {}
  };

  // Save & close on Cmd/Ctrl+Enter
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const isEnter = e.key === 'Enter' || e.key === 'NumpadEnter';
      if ((e.metaKey || e.ctrlKey) && isEnter) {
        e.preventDefault();
        // Persist latest edits then close with animation
        void closeWithAnimation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, task?.id, local]);

  const startTimeRef = useRef<HTMLInputElement | null>(null);

  const overlay = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50" onMouseDown={closeWithAnimation}>
      {/* Backdrop + monthly background */}
      <div className="absolute inset-0 bg-black/30" />
      <div aria-hidden className="absolute inset-0 bg-center bg-cover pointer-events-none" style={{ backgroundImage: 'var(--clarity-app-bg)', opacity: 0.25 }} />
      {/* Right-side fixed panel */}
      <div
        ref={panelRef}
        data-details-panel
        className="fixed right-0 top-0 h-screen w-full max-w-md card border-0 p-4 overflow-y-auto bg-white/90 dark:bg-slate-900/80 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Task Details</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 min-w-[60px] text-right">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>
            <button
              className="btn btn-icon bg-transparent dark:bg-transparent border-gray-200 dark:border-slate-600 hover:bg-transparent dark:hover:bg-transparent"
              aria-label="Duplicate task"
              title="Duplicate"
              onClick={duplicate}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              className="btn btn-icon bg-transparent dark:bg-transparent border-gray-200 dark:border-slate-600 text-red-600 hover:bg-transparent dark:hover:bg-transparent"
              aria-label="Delete task"
              title="Delete"
              onClick={remove}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              className="btn btn-icon bg-transparent dark:bg-transparent border-gray-200 dark:border-slate-600 hover:bg-transparent dark:hover:bg-transparent"
              aria-label="Close"
              title="Close"
              onClick={closeWithAnimation}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {!task || !local ? (
          <div className="py-24 text-center text-sm text-gray-500">Loading…</div>
        ) : (
        <div className="space-y-3">
          {/* Title + Done inline */}
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-300">Title</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="checkbox"
                aria-label={local.checked ? 'Mark as not done' : 'Mark as done'}
                title={local.checked ? 'Mark as not done' : 'Mark as done'}
                className="checkbox-circle checkbox-2xl"
                checked={!!local.checked}
                onChange={(e) => setLocal({ ...local, checked: e.target.checked, stage: e.target.checked ? 'done' : 'todo' })}
                onBlur={async () => { await updateTask(task.id, sanitize(local)); }}
              />
              <input
                className={`h-10 flex-1 px-3 rounded-2xl bg-transparent border-0 outline-none appearance-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600 transition-colors ${local.checked ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
                placeholder="Title"
                value={local.title}
                onChange={(e) => setLocal({ ...local, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    try { (startTimeRef.current as HTMLInputElement | null)?.focus(); } catch {}
                  }
                }}
                onBlur={async () => { await updateTask(task.id, sanitize(local)); }}
              />
            </div>
          </div>
          <DescriptionEditor value={local.description ?? ''} onChange={(v) => setLocal({ ...local, description: v })} />
          <RangesTimeline taskId={task.id} highlightRangeId={highlightRangeId} />
          <SubtasksEditor task={local} setTask={setLocal} />
          {linked.length > 0 && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Linked Tasks</div>
              <ul className="list-disc ml-5 text-sm">
                {linked.map((lt) => (<li key={lt.id}>{lt.title}</li>))}
              </ul>
            </div>
          )}
          {/* Autosave in effect; no explicit Save button */}
        </div>
        )}
      </div>
    </div>
  );

  // Render in a portal to avoid any transformed ancestor affecting positioning
  if (!open) return null;
  if (typeof window !== 'undefined') {
    return createPortal(overlay, document.body);
  }
  return overlay;
}

// Removed the previous AI Subtasks pane; generation is now a single lightning button next to "+" in Subtasks.

// TimeRangeEditor removed; Timeline is the primary editor now.

function RangesTimeline({ taskId, highlightRangeId }: { taskId: string; highlightRangeId?: string }) {
  const task = useStore((s) => s.tasks[taskId]);
  const addRange = useStore((s) => s.addRange);
  const updateRange = useStore((s) => s.updateRange);
  const updateTask = useStore((s) => s.updateTask);
  const deleteRange = useStore((s) => s.deleteRange);
  const [adding, setAdding] = useState(false);
  const [draftStart, setDraftStart] = useState<string | undefined>(undefined); // ISO
  const [draftEnd, setDraftEnd] = useState<string | undefined>(undefined);     // ISO
  const [draftAllDay, setDraftAllDay] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const initialized = useRef<boolean>(false);

  const ranges = (task?.ranges && task.ranges.length > 0)
    ? [...task.ranges].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    : (task?.start && task?.end ? [{ id: 'primary', taskId: task.id, start: task.start, end: task.end, allDay: task.allDay }] as any[] : []);

  useEffect(() => {
    for (const r of ranges) seenRef.current.add(r.id);
    if (!initialized.current) initialized.current = true;
  }, [ranges.map((r: any) => r.id).join(',')]);

  const openAdd = () => {
    setAdding(true);
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setDraftStart(now.toISOString());
    setDraftEnd(end.toISOString());
    setDraftAllDay(false);
  };
  const cancelAdd = () => { setAdding(false); };
  const saveAdd = async () => {
    const s = draftStart;
    const e = draftEnd;
    if (!s || !e) return;
    await addRange(taskId, { start: s, end: e, allDay: draftAllDay });
    setAdding(false);
  };

  const fmtRange = (sISO: string, eISO: string, allDay?: boolean): string => {
    try {
      const s = new Date(sISO);
      const e = new Date(eISO);
      const sameDay = isSameDay(s, e);
      const includeYear = !isSameYear(s, e);
      if (allDay) {
        return format(s, includeYear ? 'EEE, MMM d, yyyy' : 'EEE, MMM d') + ' • All‑day';
      }
      if (sameDay) {
        const day = format(s, includeYear ? 'EEE, MMM d, yyyy' : 'EEE, MMM d');
        return `${day} • ${format(s, 'p')} – ${format(e, 'p')}`;
      }
      const left = format(s, includeYear ? 'MMM d, yyyy p' : 'MMM d p');
      const right = format(e, includeYear ? 'MMM d, yyyy p' : 'MMM d p');
      return `${left} → ${right}`;
    } catch { return ''; }
  };

  // Relative time helper (Today/Tomorrow/Yesterday/in X)
  const now = new Date();
  const relativeShort = (d: Date): string => {
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    if (isYesterday(d)) return 'Yesterday';
    const diffMs = d.getTime() - now.getTime();
    const future = diffMs > 0;
    const absMin = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
    const val = absMin < 60 ? `${absMin}m` : (absMin < 1440 ? `${Math.round(absMin / 60)}h` : `${Math.round(absMin / 1440)}d`);
    return future ? `in ${val}` : `${val} ago`;
  };


  const listRef = useRef<HTMLDivElement | null>(null);
  // Collapse edit when clicking outside the editing card
  useEffect(() => {
    if (!editingId) return;
    const onDocPointer = (ev: MouseEvent | TouchEvent) => {
      const root = listRef.current;
      if (!root) return;
      const current = root.querySelector(`[data-range-id="${CSS.escape?.(editingId) || editingId}"]`) as HTMLElement | null;
      if (!current) return;
      const target = ev.target as HTMLElement | null;
      // Ignore clicks inside the DateTimePicker popover
      if (target && (target.closest('.dtp-pop') || target.closest('.dtp-portal'))) return;
      if (target && current.contains(target)) return; // clicked inside editing card
      setEditingId(null);
    };
    document.addEventListener('mousedown', onDocPointer, true);
    document.addEventListener('touchstart', onDocPointer, true);
    return () => {
      document.removeEventListener('mousedown', onDocPointer, true);
      document.removeEventListener('touchstart', onDocPointer, true);
    };
  }, [editingId]);
  // Flash the requested range when opening from calendar
  useEffect(() => {
    if (!highlightRangeId) return;
    const root = listRef.current;
    if (!root) return;
    const sel = root.querySelector(`[data-range-id="${CSS.escape?.(highlightRangeId) || highlightRangeId}"] .timeline-card`) as HTMLElement | null
      || root.querySelector(`[data-range-id="${CSS.escape?.(highlightRangeId) || highlightRangeId}"]`) as HTMLElement | null;
    if (sel) {
      sel.classList.add('subtask-new-flash');
      window.setTimeout(() => sel.classList.remove('subtask-new-flash'), 2400);
    }
  }, [highlightRangeId, ranges.map((r: any) => r.id).join(',')]);

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-600 dark:text-gray-300">Timeline</label>
        {!adding && (
          <button
            type="button"
            className="btn btn-ghost h-9 w-9 p-0 inline-flex items-center justify-center bg-transparent dark:bg-transparent dark:hover:bg-transparent border-0 dark:border-transparent"
            aria-label="Add range"
            title="Add range"
            onClick={openAdd}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* Quick Add removed by request */}
      {/* Summary line removed per request */}
      <div ref={listRef} className="timeline mt-2">
        {adding && (
          <div className="timeline-item timeline-new">
            <div className="timeline-card card p-3">
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">From</label>
                  <DateTimePicker value={draftStart} onChange={setDraftStart} dateOnly={draftAllDay} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">To</label>
                  <DateTimePicker value={draftEnd} onChange={setDraftEnd} dateOnly={draftAllDay} />
                </div>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" className="checkbox-circle" checked={!!draftAllDay} onChange={(e) => setDraftAllDay(e.target.checked)} />
                  All‑day
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={cancelAdd}>Cancel</button>
                  <button type="button" className="btn h-8 px-3 text-xs" onClick={saveAdd}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {(() => {
          const out: JSX.Element[] = [];
          const arr = ranges as any[];
          for (let i = 0; i < arr.length; i++) {
            const r = arr[i];
            const isFirst = i === 0;
            const isLast = i === arr.length - 1;
            const isEditing = editingId === r.id;
            const isNew = initialized.current ? !seenRef.current.has(r.id) : false;
            const startDate = new Date(r.start);
            const endDate = new Date(r.end);
            const inProgress = isWithinInterval(new Date(), { start: startDate, end: endDate });
            const durationMin = Math.max(1, differenceInMinutes(endDate, startDate));
            const elapsedMin = inProgress ? Math.max(0, Math.min(durationMin, differenceInMinutes(new Date(), startDate))) : 0;
            const pct = inProgress ? Math.max(0, Math.min(100, Math.round((elapsedMin / durationMin) * 100))) : 0;
            const node = (
              <div
                className="timeline-card card p-3 min-w-0"
                onClick={() => { if (!isEditing) setEditingId(r.id); }}
                role={!isEditing ? 'button' : undefined}
                tabIndex={!isEditing ? 0 : undefined}
              >
                {inProgress && (
                  <div className="timeline-progress" aria-hidden>
                    <div className="timeline-progress-bar" style={{ width: pct + '%' }} />
                  </div>
                )}
                {!isEditing ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm min-w-0">
                      <div className="font-medium truncate">{fmtRange(r.start, r.end, r.allDay)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {relativeShort(startDate)}{inProgress ? ` • ${Math.max(1, durationMin - elapsedMin)}m left` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <button className="btn btn-ghost h-9 w-9 p-0 inline-flex items-center justify-center bg-transparent dark:bg-transparent dark:hover:bg-transparent border-0 dark:border-transparent" aria-label="Delete range" title="Delete range" onClick={async (e) => {
                        e.stopPropagation();
                        if (r.id === 'primary') await updateTask(taskId, { start: undefined, end: undefined });
                        else await deleteRange(r.id);
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <DateTimePicker value={r.start} onChange={async (iso) => {
                        if (r.id === 'primary') await updateTask(taskId, { start: iso });
                        else await updateRange(r.id, { start: iso });
                      }} dateOnly={!!r.allDay} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <DateTimePicker value={r.end} onChange={async (iso) => {
                        if (r.id === 'primary') await updateTask(taskId, { end: iso });
                        else await updateRange(r.id, { end: iso });
                      }} dateOnly={!!r.allDay} />
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" className="checkbox-circle" checked={!!r.allDay} onChange={async (e) => {
                        const allDay = e.target.checked;
                        if (r.id === 'primary') await updateTask(taskId, { allDay });
                        else await updateRange(r.id, { allDay });
                      }} />
                      All‑day
                    </label>
                    {/* Done button removed: click outside to close editing */}
                  </div>
                )}
              </div>
            );
            out.push(
              <div key={r.id} className={`timeline-item ${isNew ? 'timeline-new' : ''}`} data-range-id={r.id}>
                {node}
              </div>
            );
            if (!isLast) {
              out.push(<div key={`gap-${r.id}`} className="timeline-gap" aria-hidden />);
            }
          }
          return out;
        })()}
      </div>
    </div>
  );
}

function looseParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  try {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
  } catch {}
  return null;
}

function normalizeSubtaskList(parsed: any): string[] {
  if (!parsed) return [];
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.subtasks) ? parsed.subtasks : [];
  const titles = arr.map((x: any) => typeof x === 'string' ? x : (x && typeof x.title === 'string' ? x.title : '')).filter((s: string) => typeof s === 'string' && s.trim().length > 0);
  // Deduplicate while preserving order
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of titles) {
    const key = t.trim().toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out.slice(0, 12);
}

function DescriptionEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // autosize textarea height
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(280, Math.max(80, el.scrollHeight)).toString() + 'px';
  }, [value]);

  return (
    <div>
      <label className="text-sm text-gray-600 dark:text-gray-300">Description</label>
      <textarea
        ref={taRef}
        className="mt-1 resize-none h-24 w-full px-3 py-2 rounded-2xl bg-transparent border-0 outline-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600"
        rows={3}
        placeholder="Add details…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SubtasksEditor({ task, setTask }: { task: Task; setTask: (t: Task) => void }) {
  const saveSubtasks = useStore((s) => s.updateTask);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [genState, setGenState] = useState<'idle'|'loading'>('idle');

  function measurePositions(): Map<string, number> {
    const map = new Map<string, number>();
    const els = listRef.current?.querySelectorAll('[data-subtask-id]');
    if (!els) return map;
    els.forEach((el) => {
      const id = (el as HTMLElement).getAttribute('data-subtask-id') || '';
      map.set(id, (el as HTMLElement).getBoundingClientRect().top);
    });
    return map;
  }

  function animateFrom(prev: Map<string, number>) {
    const els = listRef.current?.querySelectorAll('[data-subtask-id]');
    if (!els) return;
    els.forEach((el) => {
      const node = el as HTMLElement;
      const id = node.getAttribute('data-subtask-id') || '';
      const prevTop = prev.get(id);
      const newTop = node.getBoundingClientRect().top;
      if (prevTop != null) {
        const dy = prevTop - newTop;
        if (Math.abs(dy) > 0) {
          node.style.transform = `translateY(${dy}px)`;
          node.style.transition = 'transform 180ms ease, opacity 180ms ease';
          requestAnimationFrame(() => {
            node.style.transform = '';
          });
          setTimeout(() => {
            node.style.transition = '';
          }, 220);
        }
      } else {
        // Newly added
        node.style.opacity = '0';
        requestAnimationFrame(() => {
          node.style.transition = 'opacity 180ms ease';
          node.style.opacity = '1';
          setTimeout(() => { node.style.transition = ''; node.style.opacity = ''; }, 220);
        });
      }
    });
  }
  const addAfter = (afterId: string) => {
    const prev = measurePositions();
    const arr: SubTask[] = [...(task.subTasks ?? [])];
    const idx = arr.findIndex((s) => s.id === afterId);
    const newId = crypto.randomUUID();
    const newItem: SubTask = { id: newId, title: '', done: false };
    const list = idx >= 0 ? [...arr.slice(0, idx + 1), newItem, ...arr.slice(idx + 1)] : [...arr, newItem];
    setTask({ ...task, subTasks: list });
    void saveSubtasks(task.id, { subTasks: list });
    requestAnimationFrame(() => {
      animateFrom(prev);
      const el = listRef.current?.querySelector(`[data-subtask-id="${newId}"]`) as HTMLElement | null;
      if (el) {
        el.classList.add('subtask-new-flash');
        window.setTimeout(() => el.classList.remove('subtask-new-flash'), 2400);
      }
      setTimeout(() => {
        const input = listRef.current?.querySelector(`[data-subtask-id="${newId}"] input[type="text"]`) as HTMLInputElement | null;
        input?.focus();
      }, 30);
    });
  };
  // Split current subtask: move its title to a new item below, leave current empty and keep focus
  const splitAt = (id: string) => {
    const prev = measurePositions();
    const arr: SubTask[] = [...(task.subTasks ?? [])];
    const idx = arr.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const cur = arr[idx];
    const moved: SubTask = { id: crypto.randomUUID(), title: cur.title, done: cur.done };
    const list = [...arr.slice(0, idx + 1), moved, ...arr.slice(idx + 1)];
    list[idx] = { ...cur, title: '' };
    setTask({ ...task, subTasks: list });
    void saveSubtasks(task.id, { subTasks: list });
    requestAnimationFrame(() => {
      animateFrom(prev);
      const el = listRef.current?.querySelector(`[data-subtask-id="${moved.id}"]`) as HTMLElement | null;
      if (el) {
        el.classList.add('subtask-new-flash');
        window.setTimeout(() => el.classList.remove('subtask-new-flash'), 2400);
      }
    });
  };

  const add = () => {
    const prev = measurePositions();
    const newId = crypto.randomUUID();
    const list: SubTask[] = [...(task.subTasks ?? []), { id: newId, title: '', done: false }];
    setTask({ ...task, subTasks: list });
    void saveSubtasks(task.id, { subTasks: list });
    requestAnimationFrame(() => animateFrom(prev));
  };
  const update = (id: string, patch: Partial<SubTask>) => {
    const prev = measurePositions();
    let list = (task.subTasks ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
    if (Object.prototype.hasOwnProperty.call(patch, 'done')) {
      const undone = list.filter((s) => !s.done);
      const done = list.filter((s) => s.done);
      list = [...undone, ...done];
    }
    setTask({ ...task, subTasks: list });
    void saveSubtasks(task.id, { subTasks: list });
    requestAnimationFrame(() => animateFrom(prev));
  };
  const remove = (id: string) => {
    const prev = measurePositions();
    const list = (task.subTasks ?? []).filter((s) => s.id !== id);
    setTask({ ...task, subTasks: list });
    void saveSubtasks(task.id, { subTasks: list });
    requestAnimationFrame(() => animateFrom(prev));
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">Subtasks</div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost h-9 w-9 p-0 inline-flex items-center justify-center bg-transparent dark:bg-transparent dark:hover:bg-transparent border-0 dark:border-transparent"
            aria-label="Generate subtasks"
            title="Generate subtasks from title & description"
            onClick={async () => {
              if (genState === 'loading') return;
              const hasKey = (()=>{ try { return !!localStorage.getItem(LS_AI_KEY); } catch { return false; } })();
              if (!hasKey) { toast('Add your Gemini API key in Settings'); return; }
              try {
                setGenState('loading');
                const prev = measurePositions();
                const apiKey = (()=>{ try { return localStorage.getItem(LS_AI_KEY) || ''; } catch { return ''; } })();
                const model = (()=>{ try { return localStorage.getItem(LS_AI_MODEL) || DEFAULT_MODEL_ID; } catch { return DEFAULT_MODEL_ID; } })();
                const existing = (task.subTasks || []).map(s => s.title).filter(Boolean);
                const sys = SUBTASKS_SYSTEM_PROMPT;
                const user = `parent_title: ${task.title}\nparent_description: ${task.description || '(none)'}\nexisting_subtasks: ${JSON.stringify(existing)}\nmax_subtasks: 8`;
                const resp = await fetch('/api/ai/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ model, apiKey, messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: user },
                  ] }),
                });
                const data = await resp.json();
                if (!data?.ok) throw new Error(data?.error || 'AI request failed');
                const parsed = looseParseJSON(String(data.content || ''));
                const arr: string[] = normalizeSubtaskList(parsed);
                if (!arr.length) { toast('No new subtasks suggested'); return; }
                const existingLC = new Set((task.subTasks || []).map(s => s.title.trim().toLowerCase()));
                const toAdd = arr
                  .map(t => t.trim())
                  .filter(Boolean)
                  .filter(t => !existingLC.has(t.toLowerCase()));
                if (!toAdd.length) { toast('All suggested subtasks already exist'); return; }
                const next = [...(task.subTasks || [])];
                const addedIds: string[] = [];
                for (const title of toAdd) {
                  const id = crypto.randomUUID();
                  addedIds.push(id);
                  next.push({ id, title, done: false });
                }
                setTask({ ...task, subTasks: next });
                void saveSubtasks(task.id, { subTasks: next });
                requestAnimationFrame(() => {
                  // Run existing FLIP/fade for new items
                  animateFrom(prev);
                  // Add a brief border blink on newly added subtasks
                  addedIds.forEach((id) => {
                    const el = listRef.current?.querySelector(`[data-subtask-id="${id}"]`) as HTMLElement | null;
                    if (el) {
                      el.classList.add('subtask-new-flash');
                      window.setTimeout(() => el.classList.remove('subtask-new-flash'), 2400);
                    }
                  });
                });
                toast(`Added ${toAdd.length} subtasks`);
              } catch (e) {
                toast((e as Error).message || 'Generation failed');
              } finally {
                setGenState('idle');
              }
            }}
          >
            {genState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          </button>
          <button className="btn btn-ghost h-9 w-9 p-0 inline-flex items-center justify-center bg-transparent dark:bg-transparent dark:border-transparent" aria-label="Add subtask" title="Add subtask" onClick={add}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2 mt-2" ref={listRef}>
        {(task.subTasks ?? []).map((st) => {
          const strike = st.done ? 'line-through text-gray-400' : '';
          return (
            <div key={st.id} data-subtask-id={st.id} className="flex items-center gap-2">
              <input
                aria-label={`Mark subtask '${st.title || 'Untitled'}' as ${st.done ? 'not done' : 'done'}`}
                type="checkbox"
                className="checkbox-circle checkbox-xl"
                checked={st.done}
                onChange={(e) => update(st.id, { done: e.target.checked })}
              />
              <input
                className={`h-9 flex-1 px-3 rounded-xl bg-transparent border-0 outline-none appearance-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600 ${strike}`}
                value={st.title}
                onChange={(e) => update(st.id, { title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    splitAt(st.id);
                  }
                }}
              />
              <button className="btn btn-ghost h-9 w-9 p-0 inline-flex items-center justify-center bg-transparent dark:bg-transparent dark:hover:bg-transparent border-0 dark:border-transparent" aria-label="Delete subtask" title="Delete subtask" onClick={() => remove(st.id)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toLocalDT(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDT(s: string): string | undefined {
  if (!s) return undefined;
  return new Date(s).toISOString();
}

// toLocalTime helpers removed with TimeRangeEditor

function sanitize(t: Task): Partial<Task> {
  return {
    title: t.title?.trim(),
    description: t.description?.trim() || undefined,
    stage: t.stage,
    checked: !!t.checked,
    start: t.start,
    end: t.end,
    allDay: t.allDay,
    isEvent: t.isEvent,
    hiddenOnCalendar: t.hiddenOnCalendar,
    linkedTo: t.linkedTo ? Array.from(new Set(t.linkedTo.filter(Boolean))) : undefined,
    parentId: t.parentId ?? undefined,
    subTasks: t.subTasks?.map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
    calendarId: t.calendarId,
    order: t.order,
  };
}
