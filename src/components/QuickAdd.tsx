'use client';
import { useEffect, useRef, useState } from 'react';
import { parseQuickInput, extractDateTimeHints, ParsedHint } from '@/lib/nlp';
import { z } from 'zod';
import { useStore } from '@/store';
import { toast } from '@/lib/toast';

const schema = z.object({ title: z.string().min(1) });

type Props = { open: boolean; onClose: () => void; initialText?: string };

export default function QuickAdd({ open, onClose, initialText = '' }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<ParsedHint[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
      inputRef.current?.focus();
    }
  }, [open, initialText]);

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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4" onClick={() => { setText(''); onClose(); }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="card w-full max-w-2xl p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {/* Highlights overlay (behind input text) */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none px-3 py-2 whitespace-pre overflow-hidden select-none qa-inline-layer"
              dangerouslySetInnerHTML={{ __html: buildHighlightHTML(text, hints) }}
            />
            <input
              ref={inputRef}
              className="input"
              aria-label="Quick Add"
              placeholder='E.g., "Design review" tomorrow 2 PM !event'
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ background: 'transparent', position: 'relative' }}
            />
          </div>
          <button className="btn-primary px-4 py-2 rounded-lg" type="submit">Add</button>
          <button className="btn" type="button" onClick={() => { setText(''); onClose(); }}>Close</button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
      </form>
    </div>
  );
}
