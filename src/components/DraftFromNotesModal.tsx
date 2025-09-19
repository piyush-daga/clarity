'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store';
import { LS_AI_KEY, LS_AI_MODEL, DEFAULT_MODEL_ID } from '@/lib/ai';
import { toast } from '@/lib/toast';
import Link from 'next/link';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import DateTimePicker from '@/components/DateTimePicker';

type Props = { open: boolean; onClose: () => void };

type UID = string;

type DraftItem = {
  id: UID; // UI-only id
  include: boolean;
  title: string;
  description?: string;
  isEvent: boolean;
  start?: string; // ISO
  end?: string;   // ISO
  allDay?: boolean;
  subTasks?: { id: UID; title: string; done: boolean }[];
};

export default function DraftFromNotesModal({ open, onClose }: Props) {
  const [notes, setNotes] = useState('');
  const [view, setView] = useState<'input'|'preview'>('input');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const calendars = useStore((s) => s.calendars);
  const createTask = useStore((s) => s.createTask);
  const refresh = useStore((s) => s.refresh);

  const defaultCalendarId = useMemo(() => {
    const firstEnabled = calendars.find((c) => c.enabled && !c.readOnly);
    return firstEnabled?.id || 'local';
  }, [calendars]);

  useEffect(() => {
    if (open) {
      setNotes('');
      setItems([]);
      setView('input');
      setError(null);
    }
  }, [open]);

  const analyze = async () => {
    if (!notes.trim()) { setError('Paste some notes to analyze.'); return; }
    const hasKey = (() => { try { return !!localStorage.getItem(LS_AI_KEY); } catch { return false; } })();
    if (!hasKey) { toast('Add your Gemini API key in Settings'); setError('Missing AI key'); return; }
    setLoading(true);
    setError(null);
    try {
      const apiKey = (() => { try { return localStorage.getItem(LS_AI_KEY) || ''; } catch { return ''; } })();
      const model = (() => { try { return localStorage.getItem(LS_AI_MODEL) || DEFAULT_MODEL_ID; } catch { return DEFAULT_MODEL_ID; } })();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const now = new Date().toISOString();
      const sys = DRAFT_SYSTEM_PROMPT;
      const user = `now: ${now}\ntimezone: ${tz}\nnotes:\n${notes}`;
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
      const next = normalizeDraftItems(parsed);
      if (!next.length) {
        setError('No tasks or events were identified.');
        setItems([]);
        setView('input');
        return;
      }
      setItems(next);
      setView('preview');
    } catch (e) {
      setError((e as Error).message || 'Failed to analyze notes');
    } finally {
      setLoading(false);
    }
  };

  const confirmCreate = async () => {
    const selected = items.filter((i) => i.title.trim());
    if (!selected.length) { toast('Nothing to create.'); return; }
    try {
      for (const it of selected) {
        const startEnd = normalizeStartEnd(it.start, it.end, !!it.allDay);
        await createTask({
          title: it.title.trim(),
          description: it.description?.trim() || undefined,
          stage: 'todo',
          checked: false,
          start: startEnd.start,
          end: startEnd.end,
          allDay: startEnd.allDay,
          isEvent: !!it.isEvent,
          hiddenOnCalendar: false,
          linkedTo: undefined,
          parentId: null,
          subTasks: (it.subTasks || []).map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
          calendarId: defaultCalendarId,
        } as any);
      }
      toast(`Created ${selected.length} ${selected.length === 1 ? 'task' : 'tasks'}.`);
      await (refresh as any)();
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Failed to create tasks');
    }
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    if (open) window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Bulk Add</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        {view === 'input' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">Bulk Add: Paste items or notes. I’ll detect tasks, events, deadlines, and subtasks.</p>
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900/80 dark:to-slate-900/60 shadow-inner backdrop-blur-md">
              <textarea
                className="w-full h-48 resize-y px-3 py-2 rounded-2xl bg-transparent border-0 outline-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600"
                placeholder="E.g.\n– Kickoff Monday 10–11am\n– Ship homepage by Friday; subtasks: hero copy, screenshots, QA\n– Follow up with Alice next week"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex items-center justify-between">
              <AIAccessHint />
              <button className="btn inline-flex items-center gap-2" onClick={analyze} disabled={loading}>{loading ? (<span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Analyzing…</span>) : (<span className="inline-flex items-center gap-2">Preview</span>)}</button>
            </div>
          </div>
        )}

        {view === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-300">{items.length} {items.length === 1 ? 'item' : 'items'} to create — remove any you don’t want.</div>
              <div className="flex items-center gap-2">
                <button className="btn" onClick={() => setView('input')}>Back</button>
                <button className="btn" onClick={confirmCreate}>Create {items.length} {items.length === 1 ? 'task' : 'tasks'}</button>
              </div>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
              {items.map((it, idx) => (
                <PreviewItem
                  key={it.id}
                  item={it}
                  setItem={(next) => setItems((arr) => arr.map((x) => x.id === it.id ? next : x))}
                  index={idx+1}
                  onRemove={() => setItems((arr) => arr.filter((x) => x.id !== it.id))}
                />
              ))}
            </div>
            {items.length === 0 && <p className="text-sm text-gray-500">No items found.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function AIAccessHint() {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { try { setHasKey(!!localStorage.getItem(LS_AI_KEY)); } catch { setHasKey(false); } }, []);
  if (hasKey) return null;
  return <div className="text-xs text-gray-500">Add a Gemini API key in <Link className="underline" href="/settings">Settings</Link>.</div>;
}

function PreviewItem({ item, setItem, index, onRemove }: { item: DraftItem; setItem: (i: DraftItem) => void; index: number; onRemove?: () => void }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, Math.max(64, el.scrollHeight)) + 'px'; }, [item.description]);
  
  return (
    <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <input className="input h-12 text-[16px]" placeholder={item.isEvent ? 'Event title' : 'Task title'} value={item.title} onChange={(e)=>setItem({ ...item, title: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="inline-flex items-center gap-1"><input type="checkbox" className="checkbox-circle" checked={item.isEvent} onChange={(e)=>setItem({ ...item, isEvent: e.target.checked })} />Event</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" className="checkbox-circle" checked={!!item.allDay} onChange={(e)=>setItem(adjustAllDay(item, e.target.checked))} />All‑day</label>
          {onRemove && (
            <button className="btn border-transparent h-9 w-9 p-0 inline-flex items-center justify-center" aria-label="Remove item" title="Remove item" onClick={onRemove}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-300">{item.allDay ? 'Date' : 'Start'}</label>
          {item.allDay ? (
            <DateTimePicker className="mt-1" dateOnly value={item.start} onChange={(iso)=> setItem(normalizeAllDayRange({ ...item, start: iso }))} />
          ) : (
            <DateTimePicker className="mt-1" value={item.start} onChange={(iso)=> setItem({ ...item, start: iso })} />
          )}
        </div>
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-300">{item.allDay ? 'End Date' : 'End'}</label>
          {item.allDay ? (
            <DateTimePicker className="mt-1" dateOnly value={item.end} onChange={(iso)=> setItem(normalizeAllDayRange({ ...item, end: iso }))} />
          ) : (
            <DateTimePicker className="mt-1" value={item.end} onChange={(iso)=> setItem({ ...item, end: iso })} />
          )}
        </div>
      </div>
      <div className="mt-2">
        <label className="text-sm text-gray-600 dark:text-gray-300">Description</label>
        <textarea ref={taRef} className="mt-1 resize-none w-full px-3 py-2 rounded-2xl bg-transparent border-0 outline-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600" rows={3} placeholder="Add details…" value={item.description || ''} onChange={(e)=>setItem({ ...item, description: e.target.value })} />
      </div>
      <SubtasksEditor item={item} setItem={setItem} />
    </div>
  );
}

function SubtasksEditor({ item, setItem }: { item: DraftItem; setItem: (i: DraftItem) => void }) {
  const add = () => setItem({ ...item, subTasks: [...(item.subTasks || []), { id: crypto.randomUUID(), title: '', done: false }] });
  const update = (id: UID, patch: Partial<{ title: string; done: boolean }>) => {
    const list = (item.subTasks || []).map((s) => (s.id === id ? { ...s, ...patch } : s));
    setItem({ ...item, subTasks: list });
  };
  const remove = (id: UID) => setItem({ ...item, subTasks: (item.subTasks || []).filter((s) => s.id !== id) });
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">Subtasks</div>
        <button className="btn border-transparent h-9 w-9 p-0 inline-flex items-center justify-center" aria-label="Add subtask" title="Add subtask" onClick={add}><Plus className="w-4 h-4"/></button>
      </div>
      <div className="space-y-2 mt-2">
        {(item.subTasks || []).map((st) => (
          <div key={st.id} className="flex items-center gap-2">
            <input type="checkbox" className="checkbox-circle checkbox-xl" checked={st.done} onChange={(e)=>update(st.id, { done: e.target.checked })} />
            <input className="h-9 flex-1 px-3 rounded-xl bg-transparent border-0 outline-none appearance-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600" value={st.title} onChange={(e)=>update(st.id, { title: e.target.value })} />
            <button className="btn border-transparent h-9 w-9 p-0 inline-flex items-center justify-center" aria-label="Delete subtask" title="Delete subtask" onClick={()=>remove(st.id)}><Trash2 className="w-4 h-4"/></button>
          </div>
        ))}
        {(item.subTasks || []).length === 0 && <div className="text-xs text-gray-500">No subtasks.</div>}
      </div>
    </div>
  );
}

// Helpers
function toLocalDT(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalDT(s: string): string | undefined { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d.toISOString(); }
function toLocalDate(iso?: string): string { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromLocalDate(s: string): string | undefined { if (!s) return undefined; const [y,m,d] = s.split('-').map((x)=>parseInt(x,10)); if (!y||!m||!d) return undefined; const dt = new Date(y, m-1, d, 0, 0, 0, 0); return dt.toISOString(); }
function setAllDayDate(item: DraftItem, date: string, which: 'start'|'end'): DraftItem {
  const base = which === 'start' ? fromLocalDate(date) : fromLocalDate(date);
  const next: DraftItem = { ...item };
  if (which === 'start') next.start = base;
  else next.end = base;
  return normalizeAllDayRange(next);
}
function adjustAllDay(item: DraftItem, allDay: boolean): DraftItem {
  const next: DraftItem = { ...item, allDay };
  if (allDay) return normalizeAllDayRange(next);
  return next;
}
function normalizeAllDayRange(item: DraftItem): DraftItem {
  if (!item.allDay) return item;
  const start = item.start ? new Date(item.start) : new Date();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const e = item.end ? new Date(item.end) : new Date(s.getTime() + 24 * 60 * 60 * 1000);
  let end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);
  if (end.getTime() <= s.getTime()) end = new Date(s.getTime() + 24 * 60 * 60 * 1000);
  return { ...item, start: s.toISOString(), end: end.toISOString(), allDay: true };
}
function normalizeStartEnd(start?: string, end?: string, allDay?: boolean): { start?: string; end?: string; allDay?: boolean } {
  if (allDay) {
    const s = start ? new Date(start) : new Date();
    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    let e0: Date;
    if (end) {
      const e = new Date(end);
      e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);
      if (e0.getTime() <= s0.getTime()) e0 = new Date(s0.getTime() + 24 * 60 * 60 * 1000);
    } else {
      e0 = new Date(s0.getTime() + 24 * 60 * 60 * 1000);
    }
    return { start: s0.toISOString(), end: e0.toISOString(), allDay: true };
  }
  if (start && !end) {
    const s = new Date(start);
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    return { start: s.toISOString(), end: e.toISOString(), allDay: false };
  }
  return { start, end, allDay };
}

// Parsing helpers
function looseParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  try {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
  } catch {}
  return null;
}

function asString(x: any): string | undefined { return typeof x === 'string' ? x : undefined; }
function asBool(x: any): boolean | undefined { return typeof x === 'boolean' ? x : undefined; }
function toISOOrUndefined(s?: string): string | undefined { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d.toISOString(); }

function normalizeDraftItems(parsed: any): DraftItem[] {
  const arr: any[] = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const out: DraftItem[] = [];
  for (const it of arr) {
    const title = asString(it?.title)?.trim();
    if (!title) continue;
    const type = String(it?.type || (it?.isEvent ? 'event' : 'task')).toLowerCase();
    const isEvent = type === 'event';
    const allDay = asBool(it?.allDay) ?? undefined;
    // Accept several possible fields from the model
    const start = asString(it?.start) || asString(it?.when) || asString(it?.startTime) || asString(it?.due);
    const end = asString(it?.end) || asString(it?.endTime) || undefined;
    const desc = asString(it?.description) || asString(it?.notes) || undefined;
    const subsRaw: any[] = Array.isArray(it?.subtasks) ? it.subtasks : [];
    const subTasks = subsRaw
      .map((s) => (typeof s === 'string' ? s : (s && typeof s.title === 'string' ? s.title : '')))
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((title) => ({ id: crypto.randomUUID(), title, done: false }));

    let startISO = toISOOrUndefined(start);
    let endISO = toISOOrUndefined(end);
    if (allDay) {
      const norm = normalizeStartEnd(startISO, endISO, true);
      startISO = norm.start; endISO = norm.end;
    }

    out.push({
      id: crypto.randomUUID(),
      include: true,
      title,
      description: desc,
      isEvent,
      start: startISO,
      end: endISO,
      allDay: allDay,
      subTasks,
    });
  }
  return out;
}

const DRAFT_SYSTEM_PROMPT = `You are a planner assistant. Extract actionable items from freeform notes.
Return ONLY JSON with this schema:
{
  "items": [
    {
      "type": "task" | "event",
      "title": string,
      "description"?: string,
      "start"?: ISO 8601 datetime (e.g., 2025-09-18T10:00:00-07:00),
      "end"?: ISO 8601 datetime,
      "allDay"?: boolean,
      "subtasks"?: string[]
    }
  ]
}

Guidelines:
- Parse dates/times in the provided timezone and include ISO datetimes.
- Use type "event" for meetings or time blocks; type "task" for to-dos.
- If a task has only a due date, set "start" to that date (00:00) and "allDay": true. No need for "end".
- Keep titles concise. Prefer 3–7 words.
- Subtasks should be short, concrete actions.
- If nothing is actionable, return {"items": []}.
`;
