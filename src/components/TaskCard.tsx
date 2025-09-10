'use client';
import { Link as LinkIcon } from 'lucide-react';
import { Task, Stage } from '@/types';
import { timeBadge } from '@/lib/format';
import { useEffect, useRef } from 'react';

type Props = {
  task: Task;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  showFullDate?: boolean;
};

export default function TaskCard({ task, onToggle, onOpen, showFullDate = false }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement !== el) return;
      if (e.key.toLowerCase() === ' ') {
        e.preventDefault();
        onToggle(task.id);
      } else if (e.key.toLowerCase() === 'l') {
        const event = new CustomEvent('create-followup', { detail: { id: task.id } });
        window.dispatchEvent(event);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task.id, onToggle]);

  const badge = timeBadge(task, { fullDate: showFullDate });
  const checkedClass = task.checked || task.stage === 'done' ? 'line-through text-gray-400' : '';

  const hueClass = cardHueClassesByStage(task.stage);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className={`rounded-2xl shadow-soft border p-3 focus:ring-2 focus:ring-blue-500 outline-none fc-draggable-task cursor-grab ${hueClass}`}
      data-id={task.id}
      data-title={task.title}
      role="button"
      onClick={() => onOpen(task.id)}
    >
      <div className="flex items-start gap-2">
        {/* Color dot removed to keep card neutral against global background */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <input aria-label="Toggle done" type="checkbox" className="checkbox-circle checkbox-xl" checked={!!task.checked} onChange={(e) => { e.stopPropagation(); onToggle(task.id); }} onClick={(e) => e.stopPropagation()} />
            <div className={`font-medium ${checkedClass}`}>{task.title}</div>
            {task.linkedTo && task.linkedTo.length > 0 && <LinkIcon className="w-4 h-4 text-gray-400" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {badge && <span className="text-xs px-2 py-0.5 rounded bg-white/70 text-gray-700 dark:bg-slate-700/50 dark:text-gray-200">{badge}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function cardHueClassesByStage(_stage: Stage): string {
  // Neutral style for all tasks; strike-through indicates completion
  return 'bg-white border-gray-200 text-slate-900 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100';
}

function isOverdue(task: Task): boolean {
  if (!task.end || task.checked) return false;
  try {
    return new Date(task.end).getTime() < Date.now();
  } catch { return false; }
}
