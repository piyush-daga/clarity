'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

type Props = {
  value?: string;              // ISO string or undefined
  onChange: (iso?: string) => void;
  placeholder?: string;
  className?: string;
  dateOnly?: boolean;          // when true, pick date only (midnight local)
};

export default function DateTimePicker({ value, onChange, placeholder = 'Pick date…', className = '', dateOnly = false }: Props) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const initialDate = useMemo(() => (value ? new Date(value) : new Date()), [value]);
  const [temp, setTemp] = useState<Date>(initialDate);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(initialDate));

  // Reset temporary state when closing
  useEffect(() => { if (!open) { setTemp(initialDate); setViewMonth(startOfMonth(initialDate)); } }, [open, initialDate]);

  const commit = (d: Date | undefined) => {
    if (!d) { onChange(undefined); return; }
    const out = dateOnly ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) : d;
    onChange(out.toISOString());
  };

  const display = useMemo(() => {
    try {
      if (!value) return '';
      const d = new Date(value);
      return dateOnly ? format(d, 'EEE, MMM d, yyyy') : format(d, 'EEE, MMM d • h:mm a');
    } catch { return ''; }
  }, [value, dateOnly]);

  // Close on outside click (ignore clicks inside the picker or anchor)
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent | TouchEvent) => {
      const a = anchorRef.current;
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      // Ignore clicks within the input anchor or the popover
      if (a?.contains(t)) return;
      if (t.closest('.dtp-pop') || t.closest('.dtp-portal')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('touchstart', onDoc, true); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const setDay = (d: Date) => {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), temp.getHours(), temp.getMinutes(), 0, 0);
    setTemp(next);
    commit(next);
  };

  const setTimeParts = (h12: number, minute: number, am: boolean) => {
    let h = h12 % 12; if (!am) h += 12;
    const next = new Date(temp); next.setHours(h, minute, 0, 0);
    setTemp(next);
    commit(next);
  };

  const body = (
    <div className="dtp-pop card p-2 shadow-xl">
      <div className="flex items-center justify-between mb-1.5">
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => setViewMonth(addMonths(viewMonth, -1))} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
        <div className="font-semibold text-sm select-none">{format(viewMonth, 'MMMM yyyy')}</div>
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => setViewMonth(addMonths(viewMonth, 1))} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="dtp-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (<div key={`${d}-${i}`} className="dtp-wd">{d}</div>))}
        {(() => {
          const cells: JSX.Element[] = [];
          const start = startOfWeek(startOfMonth(viewMonth));
          const end = endOfWeek(endOfMonth(viewMonth));
          let cur = start;
          while (cur <= end) {
            const d = cur;
            const out = !isSameMonth(d, viewMonth);
            const sel = isSameDay(d, temp);
            const today = isSameDay(d, new Date());
            cells.push(
              <button key={d.toISOString()} className={`dtp-day ${out ? 'is-out' : ''} ${sel ? 'is-selected' : ''} ${today ? 'is-today' : ''}`} onClick={() => setDay(d)}>
                <span className="dtp-daynum">{d.getDate()}</span>
              </button>
            );
            cur = addDays(cur, 1);
          }
          return cells;
        })()}
      </div>

      {!dateOnly && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-1"><Clock className="w-3.5 h-3.5" /> Time</div>
          <TimeSuggestInput date={temp} onChange={setTimeParts} />
        </div>
      )}

      {/* No apply/cancel; updates are immediate */}
    </div>
  );

  return (
    <>
      <button ref={anchorRef} type="button" className={`input h-9 w-full flex items-center justify-between ${className}`} onClick={() => setOpen((v) => !v)}>
        <span className={`truncate text-left ${display ? '' : 'text-gray-400 dark:text-gray-500'}`}>{display || placeholder}</span>
        <CalendarIcon className="w-4 h-4 opacity-70" />
      </button>
      {open && typeof window !== 'undefined' && createPortal(<Popover anchor={anchorRef.current}>{body}</Popover>, document.body)}
    </>
  );
}

function Popover({ anchor, children }: { anchor: HTMLElement | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;           // viewport padding
    const gap = 6;              // few‑pixel gap from panel border
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const panel = anchor.closest('[data-details-panel]') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    let left: number;
    let top: number;
    if (panelRect) {
      // Place popover to the left; right edge a few pixels from panel left border
      const desiredRight = panelRect.left - gap;
      left = Math.max(margin, Math.min(desiredRight - w, window.innerWidth - w - margin));
      top = rect.top + (rect.height - h) / 2;
      top = Math.min(Math.max(top, margin), window.innerHeight - h - margin);
      // If not enough space on the left, fall back to right of anchor (still clamped)
      if (left + w > desiredRight || left < margin + 1) {
        const alt = Math.min(rect.right + gap, window.innerWidth - w - margin);
        if (alt + w <= window.innerWidth - margin) left = alt;
      }
    } else {
      // Fallback: left of anchor; otherwise right
      left = rect.left - w - gap;
      top = rect.top + (rect.height - h) / 2;
      if (left < margin) left = Math.min(rect.right + gap, window.innerWidth - w - margin);
      top = Math.min(Math.max(top, margin), window.innerHeight - h - margin);
    }
    el.style.position = 'fixed';
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.zIndex = '50';
  }, [anchor]);
  useEffect(() => {
    if (!anchor) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const position = () => {
      if (!anchor || !el) return;
      const rect = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const margin = 8;
      const gap = 6;
      const panel = anchor.closest('[data-details-panel]') as HTMLElement | null;
      const panelRect = panel?.getBoundingClientRect();
      let left: number;
      let top: number;
      if (panelRect) {
        const desiredRight = panelRect.left - gap;
        left = Math.max(margin, Math.min(desiredRight - w, window.innerWidth - w - margin));
        top = Math.min(Math.max(rect.top + (rect.height - h) / 2, margin), window.innerHeight - h - margin);
        if (left + w > desiredRight || left < margin + 1) {
          const alt = Math.min(rect.right + gap, window.innerWidth - w - margin);
          if (alt + w <= window.innerWidth - margin) left = alt;
        }
      } else {
        left = rect.left - w - gap;
        if (left < margin) left = Math.min(rect.right + gap, window.innerWidth - w - margin);
        top = Math.min(Math.max(rect.top + (rect.height - h) / 2, margin), window.innerHeight - h - margin);
      }
      el.style.position = 'fixed';
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.zIndex = '50';
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(position); };
    schedule();
    const onScroll = schedule;
    const onResize = schedule;
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    const ro = (window as any).ResizeObserver ? new ResizeObserver(schedule) : null;
    try { ro?.observe?.(anchor); } catch {}
    return () => { cancelAnimationFrame(raf); document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); try { ro?.disconnect?.(); } catch {} };
  }, [anchor]);
  return <div ref={ref} className="dtp-portal">{children}</div>;
}

function to12h(d: Date): { hour: number; ampm: 'AM'|'PM' } {
  const raw = d.getHours();
  const ampm = raw < 12 ? 'AM' : 'PM';
  const hour = raw % 12 === 0 ? 12 : raw % 12;
  return { hour, ampm };
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

// Combined time input with scrollable suggestions
function TimeSuggestInput({ date, onChange }: { date: Date; onChange: (hour12: number, minute: number, am: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number>(-1);

  const items = useMemo(() => buildTimes(15), []);
  const label = useMemo(() => (date.getMinutes() === 0 ? format(date, 'h a') : format(date, 'h:mm a')), [date]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s));
  }, [q, items]);

  useEffect(() => { if (!open) setActive(-1); }, [open]);

  const pick = (it: TimeItem) => {
    onChange(it.hour12, it.minute, it.ampm === 'AM');
    setQ(it.label);
    setOpen(false);
    try { inputRef.current?.blur(); } catch {}
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); ensureIntoView(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, (i < 0 ? 0 : i - 1))); ensureIntoView(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[active >= 0 ? active : 0]; if (it) pick(it); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const ensureIntoView = (idx: number) => {
    const root = listRef.current; if (!root) return;
    const el = root.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
    if (!el) return;
    const top = root.scrollTop;
    const bottom = top + root.clientHeight;
    const eTop = el.offsetTop;
    const eBottom = eTop + el.offsetHeight;
    if (eTop < top) root.scrollTop = eTop;
    else if (eBottom > bottom) root.scrollTop = eBottom - root.clientHeight;
  };

  // Commit freeform text like "7pm" on blur
  const commitFreeform = () => {
    const parsed = parseTime(q, date, 15);
    if (parsed) onChange(parsed.hour12, parsed.minute, parsed.ampm === 'AM');
  };

  // Close the dropdown when clicking outside this wrapper
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.dtp-timewrap')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    return () => { document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('touchstart', onDoc, true); };
  }, [open]);

  return (
    <div className="dtp-timewrap">
      <input
        ref={inputRef}
        className="input h-9 w-full"
        value={open || q ? q : label}
        placeholder={label}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
        onBlur={commitFreeform}
      />
      {open && (
        <div className="dtp-suggest" ref={listRef} role="listbox">
          {filtered.map((it, idx) => (
            <button
              key={it.label}
              data-idx={idx}
              className={`dtp-suggest-item ${idx === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => pick(it)}
              role="option"
              aria-selected={idx === active}
            >{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

type TimeItem = { label: string; hour12: number; minute: number; ampm: 'AM'|'PM' };
function buildTimes(step: number = 15): TimeItem[] {
  const s = Math.max(1, Math.min(60, Math.round(step)));
  const out: TimeItem[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += s) {
      const ampm: 'AM'|'PM' = h < 12 ? 'AM' : 'PM';
      const h12 = (h % 12) === 0 ? 12 : h % 12;
      const label = m === 0 ? `${h12} ${ampm}` : `${h12}:${pad2(m)} ${ampm}`;
      out.push({ label, hour12: h12, minute: m, ampm });
    }
  }
  return out;
}

function parseTime(s: string, current: Date, step: number = 15): { hour12: number; minute: number; ampm: 'AM'|'PM' } | null {
  const str = String(s || '').trim().toLowerCase();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let minute = m[2] ? Math.max(0, Math.min(59, parseInt(m[2], 10))) : 0;
  let ampm: 'AM'|'PM';
  const suf = (m[3] || '').toLowerCase();
  if (suf === 'a' || suf === 'am') ampm = 'AM';
  else if (suf === 'p' || suf === 'pm') ampm = 'PM';
  else {
    if (h > 12) { ampm = 'PM'; h = h - 12; }
    else if (h === 12) ampm = 'PM';
    else ampm = current.getHours() < 12 ? 'AM' : 'PM';
  }
  if (h === 0) h = 12;
  if (h > 12) h = 12;
  const grid = Math.max(1, Math.min(30, Math.round(step)));
  minute = Math.round(minute / grid) * grid;
  if (minute >= 60) { minute = 0; h = h === 12 ? 1 : (h + 1); if (h === 12) ampm = ampm === 'AM' ? 'PM' : 'AM'; }
  return { hour12: h, minute, ampm };
}
