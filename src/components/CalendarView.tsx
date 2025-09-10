'use client';
import dynamic from 'next/dynamic';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/store';
import { setAppBackgroundByDate } from '@/lib/app-background';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false });
const FullCalendarAny: any = FullCalendar;

export default function CalendarView() {
  const events = useEvents();
  const search = useStore((s) => s.search).toLowerCase();
  const updateTask = useStore((s) => s.updateTask);
  const toggleChecked = useStore((s) => s.toggleChecked);
  const createTask = useStore((s) => s.createTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const calendars = useStore((s) => s.calendars);
  const hideDone = useStore((s) => s.hideDone);
  const calendarRef = useRef<any>(null);
  // Re-render events instantly on theme change so inline colors refresh
  useEffect(() => {
    const onTheme = () => {
      try {
        const api = calendarRef.current?.getApi?.();
        if (!api) return;
        if (typeof (api as any).batchRendering === 'function') {
          (api as any).batchRendering(() => {
            (api as any).rerenderEvents?.();
            api.updateSize();
          });
        } else {
          (api as any).rerenderEvents?.();
          api.updateSize();
        }
      } catch {}
    };
    window.addEventListener('clarity-theme-changed', onTheme as EventListener);
    return () => window.removeEventListener('clarity-theme-changed', onTheme as EventListener);
  }, []);
  const creatingIds = useRef<Set<string>>(new Set());

  // Live update event titles while editing in drawer
  useEffect(() => {
    const enqueue = (fn: () => void) => {
      try { Promise.resolve().then(fn); } catch { setTimeout(fn, 0); }
    };
    const onTitle = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail || {} as any;
      if (!id) return;
      const api = calendarRef.current?.getApi?.();
      const ev = api?.getEventById?.(id);
      if (ev) enqueue(() => ev.setProp('title', title ?? ''));
    };
    const onDone = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title?: string }>).detail || {} as any;
      if (!id) return;
      enqueue(async () => {
        const trimmed = String(title || '').trim();
        const api = calendarRef.current?.getApi?.();
        const ev = api?.getEventById?.(id);
        creatingIds.current.delete(id);
        if (!trimmed) {
          try { await deleteTask(id); } catch {}
          try { ev?.remove?.(); } catch {}
          return;
        }
        try { if (ev) ev.setProp('classNames', ['fc-event-minimal']); } catch {}
      });
    };
    window.addEventListener('task-editing-title', onTitle as EventListener);
    window.addEventListener('task-editing-done', onDone as EventListener);
    return () => {
      window.removeEventListener('task-editing-title', onTitle as EventListener);
      window.removeEventListener('task-editing-done', onDone as EventListener);
    };
  }, []);

  useEffect(() => {
    const container = document.getElementById('kanban-root');
    if (!container) return;
    const draggable = new Draggable(container, {
      itemSelector: '.fc-draggable-task',
      eventData: (el) => {
        const id = el.getAttribute('data-id')!;
        const title = el.getAttribute('data-title')!;
        return { id, title };
      },
    });
    return () => draggable.destroy();
  }, []);

  const calendarEvents = useMemo(() => {
    const enabledCals = new Set(calendars.filter((c) => c.enabled).map((c) => c.id));
    return events
      .filter((t) => enabledCals.has(t.calendarId) && !t.hiddenOnCalendar && !!t.start && !!t.end)
      .filter((t) => !(hideDone && (t.checked || t.stage === 'done')))
      .filter((t) => !search || t.title.toLowerCase().includes(search) || (t.description ?? '').toLowerCase().includes(search))
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.start,
        end: t.end,
        allDay: t.allDay,
        extendedProps: {
          stage: t.stage,
          checked: t.checked,
          subTotal: Array.isArray(t.subTasks) ? t.subTasks.length : 0,
          subDone: Array.isArray(t.subTasks) ? t.subTasks.filter((s) => s.done).length : 0,
        },
      }));
  }, [events, calendars, search, hideDone]);

  return (
    <div className="p-2 h-full overflow-hidden calendar-shell min-w-0 w-full min-h-[640px] relative rounded-2xl bg-transparent">
      <FullCalendarAny
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridFourDay"
        views={{
          timeGridFourDay: { type: 'timeGrid', duration: { days: 4 }, buttonText: '4 days' },
        }}
        buttonText={{
          today: 'today',
          dayGridMonth: 'month',
          timeGridWeek: 'week',
          timeGridDay: 'day',
          timeGridFourDay: '4 days',
        }}
        dayHeaderFormat={{ weekday: 'short' }}
        dayHeaderContent={(arg: any) => {
          try {
            const d = arg.date as Date;
            const wd = d.toLocaleDateString([], { weekday: 'short' });
            const n = d.getDate();
            const now = new Date();
            const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
            return { html: `<span class="fc-dow">${wd}</span><span class="fc-date-badge ${isToday ? 'is-today' : ''}">${n}</span>` } as any;
          } catch {
            return { text: arg.text } as any;
          }
        }}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridFourDay,timeGridWeek,timeGridDay,dayGridMonth' }}
        height="100%"
        expandRows={true}
        dayMaxEventRows={3}
        nowIndicator={true}
        selectable={true}
        selectMirror={true}
        selectMinDistance={6}
        slotLabelFormat={{ hour: 'numeric', hour12: true }}
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', hour12: true }}
        eventClassNames={(arg: any) => creatingIds.current.has(arg.event.id) ? 'fc-event-minimal fc-event-creating' : 'fc-event-minimal'}
        eventContent={(arg: any) => {
          const ep: any = arg.event.extendedProps || {};
          const done = ep.subDone ?? 0;
          const total = ep.subTotal ?? 0;
          const strike = (ep.checked || ep.stage === 'done') ? 'line-through' : '';
          const hasTime = !!arg.timeText;
          // Compact layout for short timed events (<= 30 minutes)
          const start = arg.event.start as Date | null;
          const end = arg.event.end as Date | null;
          const durationMin = (!arg.event.allDay && start && end) ? Math.max(0, (end.getTime() - start.getTime()) / 60000) : 9999;
          const compact = !arg.event.allDay && durationMin <= 30;
          const showTime = hasTime && !compact;
          if (compact) {
            return (
              <div className="flex items-center gap-1 text-xs leading-tight w-full">
                <input aria-label="Mark done" type="checkbox" className="checkbox-circle" checked={!!ep.checked} onChange={(e) => { e.stopPropagation(); toggleChecked(arg.event.id); }} onClick={(e) => e.stopPropagation()} />
                <span className={`truncate ${strike}`}>{arg.event.title}</span>
                {total > 0 && <span className="fc-pill">{done}/{total}</span>}
              </div>
            );
          }
          return (
            <div className="flex flex-col h-full w-full">
              <div className="fc-event-body flex items-start gap-2 flex-1 min-h-0 overflow-hidden">
                <input aria-label="Mark done" type="checkbox" className="checkbox-circle" checked={!!ep.checked} onChange={(e) => { e.stopPropagation(); toggleChecked(arg.event.id); }} onClick={(e) => e.stopPropagation()} />
                <span className={`fc-event-title ${strike}`}>{arg.event.title}</span>
                {total > 0 && <span className="fc-pill">{done}/{total}</span>}
              </div>
              {showTime && (
                <div className="fc-event-footer mt-auto pt-1 text-xs text-slate-600 border-t border-slate-200 dark:text-slate-300 dark:border-slate-600/70">
                  <span className="fc-event-time">{arg.timeText}</span>
                </div>
              )}
            </div>
          );
        }}
        datesSet={(arg: any) => {
          try {
            const api = calendarRef.current?.getApi?.();
            const anchor = api?.getDate?.() as Date | undefined;
            if (anchor instanceof Date && !isNaN(anchor.getTime())) {
              const m = anchor.getMonth();
              setAppBackgroundByDate(anchor);
              try { preloadMonthBackgrounds(m); } catch {}
            }
          } catch {}
          const api = calendarRef.current?.getApi?.();
          if (!api) return;
          const viewType = api.view?.type;
          if (viewType === 'timeGridWeek' || viewType === 'timeGridDay') {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            api.scrollToTime(`${hh}:${mm}:00`);
          }
        }}
        editable
        droppable
        dateClick={async (info: any) => {
          const clicks = (info.jsEvent as MouseEvent | undefined)?.detail ?? 1;
          if (clicks < 2) return;
          const api = calendarRef.current?.getApi?.();
          const viewType = api?.view?.type;
          // Create event based on the clicked context
          const allDay = !!info.allDay;
          let start = new Date(info.date);
          let end = new Date(start.getTime() + (allDay ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000));
          const created = await createTask({
            title: '',
            description: undefined,
            stage: 'todo',
            checked: false,
            start: start.toISOString(),
            end: end.toISOString(),
            allDay,
            hiddenOnCalendar: false,
            linkedTo: undefined,
            parentId: null,
            subTasks: undefined,
            calendarId: 'local',
          } as any);
          try { creatingIds.current.add(created.id); } catch {}
          try { window.dispatchEvent(new CustomEvent('open-task-details', { detail: { id: created.id } })); } catch {}
        }}
        select={async (arg: any) => {
          try {
            const start = arg.start as Date;
            const end = (arg.end as Date) || new Date(start.getTime() + 60 * 60 * 1000);
            const allDay = !!arg.allDay;
            const created = await createTask({
              title: '',
              description: undefined,
              stage: 'todo',
              checked: false,
              start: start.toISOString(),
              end: end.toISOString(),
              allDay,
              hiddenOnCalendar: false,
              linkedTo: undefined,
              parentId: null,
              subTasks: undefined,
              calendarId: 'local',
            } as any);
            try { creatingIds.current.add(created.id); } catch {}
            try { window.dispatchEvent(new CustomEvent('open-task-details', { detail: { id: created.id } })); } catch {}
            try { calendarRef.current?.getApi?.().unselect?.(); } catch {}
          } catch {}
        }}
        eventClick={(info: any) => {
          try {
            window.dispatchEvent(new CustomEvent('open-task-details', { detail: { id: info.event.id } }));
            info.jsEvent?.preventDefault();
            info.jsEvent?.stopPropagation();
          } catch {}
        }}
        eventDrop={async (info: any) => {
          const ev: any = info.event;
          const oldEv: any = (info as any).oldEvent;
          const start = ev.start as Date | null;
          let end = ev.end as Date | null;
          const allDay = ev.allDay as boolean;
          // If moved from all-day to timed, default to 30 minutes duration
          const movedFromAllDay = !!(oldEv && oldEv.allDay && !allDay);
          if (movedFromAllDay && start) {
            const dur = 30 * 60 * 1000; // 30 minutes
            end = new Date(start.getTime() + dur);
          }
          await updateTask(ev.id, { start: start?.toISOString(), end: end?.toISOString(), allDay });
        }}
        eventResize={async (info: any) => {
          await updateTask(info.event.id, { start: info.event.start?.toISOString(), end: info.event.end?.toISOString(), allDay: info.event.allDay });
        }}
        eventDidMount={(info: any) => {
          try {
            // Native tooltip with time range + accessible label
            const el = info.el as HTMLElement;
            const s = info.event.start;
            const e = info.event.end;
            if (s && e) {
              const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
              const range = `${s.toLocaleString([], opts)} – ${e.toLocaleString([], opts)}`;
              el.title = range;
              try { el.setAttribute('aria-label', `${info.event.title}: ${range}`); } catch {}
            }
          } catch {}
        }}
        drop={async (info: any) => {
          const id = (info.draggedEl as HTMLElement).getAttribute('data-id')!;
          const start = info.date;
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          await updateTask(id, { start: start.toISOString(), end: end.toISOString(), allDay: info.allDay ?? false });
        }}
        events={calendarEvents}
      />
    </div>
  );
}

function useEvents() {
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => Object.values(tasks), [tasks]);
}

function bgForMonth(m: number): string {
  const idx = (m + 1).toString().padStart(2, '0');
  const dark = isDark();
  return dark ? `/backgrounds/rich-dark/month-${idx}.svg` : `/backgrounds/rich/month-${idx}.svg`;
}

function colorFromStage(stage?: string): string {
  switch (stage) {
    case 'todo': return '#eab308'; // yellow-500
    case 'done': return '#22c55e'; // green-500
    default: return '#94a3b8'; // slate-400
  }
}

function uiFromStage(stage?: string): { bg: string; border: string } {
  const dark = isDark();
  if (!dark) {
    switch (stage) {
      case 'todo':
        return { bg: '#fefce8', border: '#fef08a' }; // yellow-50 bg, yellow-200 border
      case 'done':
        return { bg: '#f0fdf4', border: '#bbf7d0' }; // green-50 bg, green-200 border
      default:
        return { bg: 'rgba(255,255,255,0.94)', border: '#e5e7eb' }; // neutral
    }
  } else {
    switch (stage) {
      case 'todo':
        return { bg: 'rgba(253, 224, 71, 0.10)', border: '#f59e0b' }; // yellow tint
      case 'done':
        return { bg: 'rgba(34, 197, 94, 0.12)', border: '#86efac' }; // green tint
      default:
        return { bg: 'rgba(255,255,255,0.06)', border: '#475569' }; // neutral
    }
  }
}

function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  try { return document.documentElement.classList.contains('dark'); } catch { return false; }
}

function preloadMonthBackgrounds(m: number) {
  if (typeof Image === 'undefined') return;
  const months = [((m + 11) % 12), m, ((m + 1) % 12)];
  for (const mm of months) {
    const url = bgForMonth(mm);
    const img = new Image();
    img.src = url;
  }
}
