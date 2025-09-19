import { Task } from '@/types';
import { format, parseISO, isSameDay } from 'date-fns';

export function timeBadge(task: Task, opts?: { fullDate?: boolean }): string | null {
  let startISO = task.start;
  let endISO = task.end;
  // Prefer first upcoming or earliest range if present
  let allDayEffective = task.allDay;
  if (Array.isArray(task.ranges) && task.ranges.length > 0) {
    const now = new Date();
    const upcoming = task.ranges.find((r) => {
      try { return new Date(r.end).getTime() >= now.getTime(); } catch { return false; }
    });
    const chosen = upcoming ?? task.ranges[0];
    startISO = chosen?.start;
    endISO = chosen?.end;
    allDayEffective = chosen?.allDay ?? allDayEffective;
  }
  if (!startISO || !endISO) return null;
  try {
    const s = parseISO(startISO);
    const e = parseISO(endISO);
    const full = !!(opts?.fullDate);
    if (allDayEffective) return full ? `${format(s, 'MMM d')} (All‑day)` : 'All‑day';
    if (isSameDay(s, e)) {
      return full ? `${format(s, 'MMM d, p')} – ${format(e, 'p')}` : `${format(s, 'p')} – ${format(e, 'p')}`;
    }
    return full ? `${format(s, 'MMM d, p')} → ${format(e, 'MMM d, p')}` : `${format(s, 'p')} → ${format(e, 'p')}`;
  } catch {
    return null;
  }
}
