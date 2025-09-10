import { Task } from '@/types';
import { format, parseISO, isSameDay } from 'date-fns';

export function timeBadge(task: Task, opts?: { fullDate?: boolean }): string | null {
  if (!task.start || !task.end) return null;
  try {
    const s = parseISO(task.start);
    const e = parseISO(task.end);
    const full = !!(opts?.fullDate);
    if (task.allDay) return full ? `${format(s, 'MMM d')} (All‑day)` : 'All‑day';
    if (isSameDay(s, e)) {
      return full ? `${format(s, 'MMM d, p')} – ${format(e, 'p')}` : `${format(s, 'p')} – ${format(e, 'p')}`;
    }
    return full ? `${format(s, 'MMM d, p')} → ${format(e, 'MMM d, p')}` : `${format(s, 'p')} → ${format(e, 'p')}`;
  } catch {
    return null;
  }
}
