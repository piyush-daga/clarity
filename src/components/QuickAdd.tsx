'use client';
import { useEffect, useRef, useState } from 'react';
import { parseQuickInput } from '@/lib/nlp';
import { z } from 'zod';
import { useStore } from '@/store';
import { toast } from '@/lib/toast';

const schema = z.object({ title: z.string().min(1) });

type Props = { open: boolean; onClose: () => void; initialText?: string };

export default function QuickAdd({ open, onClose, initialText = '' }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      // Coerce to all-day on the appropriate day
      let startISO = task.start;
      let endISO = task.end;
      let allDay = true;
      if (startISO) {
        const s = new Date(startISO);
        const start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        startISO = start.toISOString();
        endISO = end.toISOString();
      } else {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        startISO = start.toISOString();
        endISO = end.toISOString();
      }
      await createTask({
        title: task.title!,
        description: task.description,
        stage: (task.stage ?? 'todo'),
        checked: task.checked ?? false,
        start: startISO,
        end: endISO,
        allDay,
        isEvent: true,
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
          <input ref={inputRef} className="input" aria-label="Quick Add" placeholder='E.g., "Design review" tomorrow 2 PM !event' value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary px-4 py-2 rounded-lg" type="submit">Add</button>
          <button className="btn" type="button" onClick={() => { setText(''); onClose(); }}>Close</button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
      </form>
    </div>
  );
}
