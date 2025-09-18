'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { parseQuickInput, extractDateTimeHints, ParsedHint } from '@/lib/nlp';
import { z } from 'zod';
import { useStore } from '@/store';
import { toast } from '@/lib/toast';
import { LS_AI_KEY, LS_AI_MODEL, DEFAULT_MODEL_ID } from '@/lib/ai';
import { Loader2, Trash2, Wand2, ListPlus, Plus } from 'lucide-react';

const schema = z.object({ title: z.string().min(1) });

type Props = { open: boolean; onClose: () => void; initialText?: string; initialMode?: 'quick'|'notes' };

export default function QuickAdd({ open, onClose, initialText = '', initialMode = 'quick' }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<ParsedHint[]>([]);
  const [mode, setMode] = useState<'quick'|'notes'>('quick');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const createTask = useStore((s) => s.createTask);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!open) {
          setText('');
          setError(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setText(initialText || '');
      setMode(initialMode || 'quick');
      inputRef.current?.focus();
    }
  }, [open, initialText, initialMode]);

  // Live parse hints from the current text
  useEffect(() => {
    try {
      if (!text) { setHints([]); return; }
      setHints(extractDateTimeHints(text));
    } catch { setHints([]); }
  }, [text]);

  const buildHighlightHTML = (s: string, spans: ParsedHint[]) => {
    if (!s) return '';
    const esc = (t: string) => t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const sorted = [...spans].sort((a, b) => (a.start - b.start) || (a.end - b.end));
    let html = '';
    let i = 0;
    for (const h of sorted) {
      if (h.start < i) continue; // skip overlaps
      if (h.start > i) html += esc(s.slice(i, h.start));
      const cls = h.kind === 'time' ? 'qa-inline-time' : h.kind === 'date' ? 'qa-inline-date' : 'qa-inline-datetime';
      html += `<span class=\"qa-inline ${cls}\">${esc(s.slice(h.start, h.end))}</span>`;
      i = h.end;
    }
    if (i < s.length) html += esc(s.slice(i));
    return html;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { task, errors } = parseQuickInput(text);
    if (errors?.length) {
      setError(errors.join(', '));
      return;
    }
    const parsed = schema.safeParse({ title: task.title ?? '' });
    if (!parsed.success) {
      setError('Title required');
      return;
    }
    try {
      // Use parsed times when present; default to today all-day otherwise
      let startISO = task.start;
      let endISO = task.end;
      let allDay = task.allDay ?? false;

      if (!startISO) {
        // No date/time parsed: create an all-day task for today
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        startISO = start.toISOString();
        endISO = end.toISOString();
        allDay = true;
      } else if (allDay) {
        // Ensure all-day range aligns to midnight boundaries without extending duration
        const s = new Date(startISO);
        const start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
        startISO = start.toISOString();
        if (endISO) {
          // If parser already produced an exclusive midnight end, keep it as-is (no +1 day)
          const e = new Date(endISO);
          const endAligned = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);
          let end = endAligned;
          // Safety: ensure end > start
          if (end.getTime() <= start.getTime()) {
            end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          }
          endISO = end.toISOString();
        } else {
          endISO = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
        }
      } else {
        // Timed: ensure we have an end fallback (+1h)
        if (!endISO && startISO) {
          const s = new Date(startISO);
          endISO = new Date(s.getTime() + 60 * 60 * 1000).toISOString();
        }
      }

      await createTask({
        title: task.title!,
        description: task.description,
        stage: (task.stage ?? 'todo'),
        checked: task.checked ?? false,
        start: startISO,
        end: endISO,
        allDay,
        isEvent: task.isEvent ?? true,
        hiddenOnCalendar: task.hiddenOnCalendar ?? false,
        linkedTo: task.linkedTo,
        parentId: task.parentId ?? null,
        subTasks: task.subTasks,
        calendarId: task.calendarId ?? 'local',
      } as any);
      toast('Task created.');
      setText('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setText('');
        onClose();
      }
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center p-4" onClick={() => { setText(''); onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-3xl p-4">

        {mode === 'quick' && (
          <form onSubmit={submit}>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                {/* Highlights overlay (behind input text) */}
                <div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none px-3 py-2 whitespace-pre overflow-hidden select-none qa-inline-layer"
                  dangerouslySetInnerHTML={{ __html: buildHighlightHTML(text, hints) }}
                />
                {mode === 'quick' && (
                  <div aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none hidden sm:block">
                    Press Tab for Bulk Add
                  </div>
                )}
                <input
                  ref={inputRef}
                  className="input"
                  aria-label="Quick Add"
                  placeholder='E.g., "Design review" tomorrow 2 PM !event'
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      setMode('notes');
                      setTimeout(() => { try { notesRef.current?.focus(); } catch {} }, 0);
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      // Cmd/Ctrl+Enter also submits in Quick mode
                      e.preventDefault();
                      // Find the nearest form and submit
                      (e.currentTarget.closest('form') as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                  style={{ background: 'transparent', position: 'relative' }}
                />
              </div>
              {/* No explicit button; Enter/Cmd+Enter submits */}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
          </form>
        )}

        {mode === 'notes' && (
          <DraftFromNotesInsideQuickAdd onClose={onClose} textAreaRef={notesRef} />
        )}
      </div>
    </div>
  );
}

function DraftFromNotesInsideQuickAdd({ onClose, textAreaRef }: { onClose: () => void; textAreaRef?: RefObject<HTMLTextAreaElement> }) {
  const createTask = useStore((s) => s.createTask);
  const refresh = useStore((s) => s.refresh);
  const calendars = useStore((s) => s.calendars);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const defaultCalendarId = (() => {
    const first = calendars.find((c) => c.enabled && !c.readOnly);
    return first?.id || 'local';
  })();

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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, apiKey, messages: [
          { role: 'system', content: sys }, { role: 'user', content: user },
        ] }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'AI request failed');
      const parsed = looseParseJSON(String(data.content || ''));
      const next = normalizeDraftItems(parsed);
      setItems(next);
      if (!next.length) setError('No tasks or events were identified.');
    } catch (e) { setError((e as Error).message || 'Failed to analyze notes'); }
    finally { setLoading(false); }
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
          stage: 'todo', checked: false,
          start: startEnd.start, end: startEnd.end, allDay: startEnd.allDay,
          isEvent: !!it.isEvent, hiddenOnCalendar: false,
          linkedTo: undefined, parentId: null,
          subTasks: (it.subTasks || []).map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
          calendarId: defaultCalendarId,
        } as any);
      }
      toast(`Created ${selected.length} ${selected.length === 1 ? 'task' : 'tasks'}.`);
      await (refresh as any)();
      onClose();
    } catch (e) { toast((e as Error).message || 'Failed to create tasks'); }
  };

  return (
    <div className="space-y-3" onKeyDown={(e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (loading) return;
        if (items.length > 0) void confirmCreate();
        else void analyze();
      }
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <ListPlus className="w-4 h-4 text-blue-600" />
          <span className="font-medium">Bulk Add</span>
          <span className="text-gray-500 dark:text-gray-400">Paste items or notes</span>
        </div>
        <div className="text-xs text-gray-500">Cmd/Ctrl+Enter to preview or create</div>
      </div>
      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900/80 dark:to-slate-900/60 shadow-inner backdrop-blur-md">
        <textarea
          ref={textAreaRef}
          className="w-full h-48 resize-y px-4 py-3 rounded-2xl bg-transparent border-0 outline-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600"
          placeholder={"E.g.\n– Kickoff Monday 10–11am\n– Ship homepage by Friday; subtasks: hero copy, screenshots, QA\n– Follow up with Alice next week"}
          value={notes}
          onChange={(e)=>setNotes(e.target.value)}
        />
      </div>
          <div className="flex items-center justify-between">
            <NotesAIAccessHint />
            <button className="btn inline-flex items-center gap-2" onClick={analyze} disabled={loading}>
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin"/><span>Analyzing…</span></>) : (<><Wand2 className="w-4 h-4"/><span>Preview</span></>)}
            </button>
          </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {items.length > 0 && (
        <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 px-1">
            <span>{items.length} {items.length === 1 ? 'item' : 'items'} to create — remove any you don’t want.</span>
          </div>
          {items.map((it, idx) => (
            <DraftPreviewItem
              key={it.id}
              item={it}
              setItem={(next)=>setItems(arr=>arr.map(x=>x.id===it.id?next:x))}
              index={idx+1}
              onRemove={() => setItems(arr => arr.filter(x => x.id !== it.id))}
            />
          ))}
          <div className="sticky bottom-0 pt-2">
            <div className="flex items-center justify-end rounded-xl px-3 py-2 bg-gradient-to-t from-white/90 to-transparent dark:from-slate-900/80">
              <button className="btn" onClick={confirmCreate}>Create {items.length} {items.length === 1 ? 'task' : 'tasks'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
type UID = string;
type DraftItem = { id: UID; include: boolean; title: string; description?: string; isEvent: boolean; start?: string; end?: string; allDay?: boolean; subTasks?: { id: UID; title: string; done: boolean }[] };

function DraftPreviewItem({ item, setItem, index, onRemove }: { item: DraftItem; setItem: (i: DraftItem) => void; index: number; onRemove?: () => void }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, Math.max(64, el.scrollHeight)) + 'px'; }, [item.description]);
  return (
    <div className="p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-6 rounded-full ${item.isEvent ? 'bg-blue-500' : 'bg-emerald-500'}`} aria-hidden />
          <input className="input h-12 text-[16px] font-medium" placeholder={item.isEvent ? 'Event title' : 'Task title'} value={item.title} onChange={(e)=>setItem({ ...item, title: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1"><input type="checkbox" className="checkbox-circle" checked={item.isEvent} onChange={(e)=>setItem({ ...item, isEvent: e.target.checked })} /><span className="px-2 py-0.5 rounded-full border border-gray-300 dark:border-slate-600">Event</span></label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" className="checkbox-circle" checked={!!item.allDay} onChange={(e)=>setItem(adjustAllDay(item, e.target.checked))} /><span className="px-2 py-0.5 rounded-full border border-gray-300 dark:border-slate-600">All‑day</span></label>
          {onRemove && (
            <button className="btn border-transparent h-9 w-9 p-0 inline-flex items-center justify-center" aria-label="Remove item" title="Remove item" onClick={onRemove}>
              <Trash2 className="w-4 h-4"/>
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-300">{item.allDay ? 'Date' : 'Start'}</label>
          {item.allDay ? (
            <input type="date" className="input mt-1" value={toLocalDate(item.start)} onChange={(e)=>setItem(setAllDayDate(item, e.target.value, 'start'))} />
          ) : (
            <input type="datetime-local" className="input mt-1" value={toLocalDT(item.start)} onChange={(e)=>setItem({ ...item, start: fromLocalDT(e.target.value) })} />
          )}
        </div>
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-300">{item.allDay ? 'End Date' : 'End'}</label>
          {item.allDay ? (
            <input type="date" className="input mt-1" value={toLocalDate(item.end)} onChange={(e)=>setItem(setAllDayDate(item, e.target.value, 'end'))} />
          ) : (
            <input type="datetime-local" className="input mt-1" value={toLocalDT(item.end)} onChange={(e)=>setItem({ ...item, end: fromLocalDT(e.target.value) })} />
          )}
        </div>
      </div>
      <div className="mt-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">Description</label>
        <textarea ref={taRef} className="mt-1 resize-none w-full px-3 py-2 rounded-2xl bg-transparent border-0 outline-none ring-0 shadow-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-slate-600" rows={3} placeholder="Add details…" value={item.description || ''} onChange={(e)=>setItem({ ...item, description: e.target.value })} />
      </div>
      <DraftSubtasks item={item} setItem={setItem} />
    </div>
  );
}

function DraftSubtasks({ item, setItem }: { item: DraftItem; setItem: (i: DraftItem) => void }) {
  const add = () => setItem({ ...item, subTasks: [...(item.subTasks || []), { id: crypto.randomUUID(), title: '', done: false }] });
  const update = (id: UID, patch: Partial<{ title: string; done: boolean }>) => setItem({ ...item, subTasks: (item.subTasks || []).map((s) => (s.id === id ? { ...s, ...patch } : s)) });
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

function NotesAIAccessHint() {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { try { setHasKey(!!localStorage.getItem(LS_AI_KEY)); } catch { setHasKey(false); } }, []);
  return hasKey ? null : (<div className="text-xs text-gray-500">Add a Gemini API key in Settings.</div>);
}

// Shared helpers
function toLocalDT(iso?: string): string { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalDT(s: string): string | undefined { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d.toISOString(); }
function toLocalDate(iso?: string): string { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromLocalDate(s: string): string | undefined { if (!s) return undefined; const [y,m,d] = s.split('-').map((x)=>parseInt(x,10)); if (!y||!m||!d) return undefined; const dt = new Date(y, m-1, d, 0, 0, 0, 0); return dt.toISOString(); }
function setAllDayDate(item: DraftItem, date: string, which: 'start'|'end'): DraftItem { const next: DraftItem = { ...item }; if (which==='start') next.start = fromLocalDate(date); else next.end = fromLocalDate(date); return normalizeAllDayRange(next); }
function adjustAllDay(item: DraftItem, allDay: boolean): DraftItem { const next: DraftItem = { ...item, allDay }; if (allDay) return normalizeAllDayRange(next); return next; }
function normalizeAllDayRange(item: DraftItem): DraftItem { if (!item.allDay) return item; const s = item.start ? new Date(item.start) : new Date(); const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0); let e0 = item.end ? new Date(item.end) : new Date(s0.getTime() + 86400000); e0 = new Date(e0.getFullYear(), e0.getMonth(), e0.getDate(), 0, 0, 0, 0); if (e0.getTime() <= s0.getTime()) e0 = new Date(s0.getTime() + 86400000); return { ...item, start: s0.toISOString(), end: e0.toISOString(), allDay: true }; }
function normalizeStartEnd(start?: string, end?: string, allDay?: boolean): { start?: string; end?: string; allDay?: boolean } { if (allDay) { const s = start ? new Date(start) : new Date(); const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0); let e0: Date; if (end) { const e = new Date(end); e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0); if (e0.getTime() <= s0.getTime()) e0 = new Date(s0.getTime() + 86400000); } else { e0 = new Date(s0.getTime() + 86400000); } return { start: s0.toISOString(), end: e0.toISOString(), allDay: true }; } if (start && !end) { const s = new Date(start); const e = new Date(s.getTime() + 3600000); return { start: s.toISOString(), end: e.toISOString(), allDay: false }; } return { start, end, allDay }; }
function looseParseJSON(s: string): any | null { try { return JSON.parse(s); } catch {} try { const i = s.indexOf('{'); const j = s.lastIndexOf('}'); if (i>=0 && j>i) return JSON.parse(s.slice(i, j+1)); } catch {} return null; }
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
    const start = asString(it?.start) || asString(it?.when) || asString(it?.startTime) || asString(it?.due);
    const end = asString(it?.end) || asString(it?.endTime) || undefined;
    const desc = asString(it?.description) || asString(it?.notes) || undefined;
    const subsRaw: any[] = Array.isArray(it?.subtasks) ? it.subtasks : [];
    const subTasks = subsRaw.map((s)=> (typeof s === 'string' ? s : (s && typeof s.title === 'string' ? s.title : ''))).map((s)=>String(s||'').trim()).filter(Boolean).slice(0, 20).map((title)=>({ id: crypto.randomUUID(), title, done: false }));
    let startISO = toISOOrUndefined(start); let endISO = toISOOrUndefined(end);
    if (allDay) { const norm = normalizeStartEnd(startISO, endISO, true); startISO = norm.start; endISO = norm.end; }
    out.push({ id: crypto.randomUUID(), include: true, title, description: desc, isEvent, start: startISO, end: endISO, allDay, subTasks });
  }
  return out;
}

const DRAFT_SYSTEM_PROMPT = `You are a planner assistant. Extract actionable items from freeform notes.
Return ONLY JSON with this schema:
{ "items": [ { "type": "task" | "event", "title": string, "description"?: string, "start"?: ISO 8601 datetime, "end"?: ISO 8601 datetime, "allDay"?: boolean, "subtasks"?: string[] } ] }
Guidelines:
- Parse dates/times in the provided timezone and include ISO datetimes.
- Use type "event" for meetings or time blocks; type "task" for to-dos.
- If a task has only a due date, set "start" to that date (00:00) and "allDay": true. No need for "end".
- Keep titles concise. Prefer 3–7 words.
- Subtasks should be short, concrete actions.
- If nothing is actionable, return {"items": []}.`;
