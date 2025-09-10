'use client';
import TaskCard from './TaskCard';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@/store';
import TaskDetailsDrawer from './TaskDetailsDrawer';
import { Plus, ArrowUpDown, Sunrise, Sun, Sunset, AlertTriangle } from 'lucide-react';
import { addDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { openQuickAdd } from '@/lib/quickAdd';

export default function TaskBoard() {
  const tasksMap = useStore((s) => s.tasks);
  const search = useStore((s) => s.search).toLowerCase();
  const hideDone = useStore((s) => s.hideDone);
  const toggleChecked = useStore((s) => s.toggleChecked);
  const updateTask = useStore((s) => s.updateTask);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTask, setDrawerTask] = useState<string | null>(null);
  const [overdueAsc, setOverdueAsc] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openDrawer = (id: string) => { setDrawerTask(id); setDrawerOpen(true); };

  useEffect(() => {
    const onFollow = (e: Event) => {
      // handled in parent page via store action
    };
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) {
        setDrawerTask(id);
        setDrawerOpen(true);
      }
    };
    window.addEventListener('create-followup', onFollow);
    window.addEventListener('open-task-details', onOpen as EventListener);
    return () => {
      window.removeEventListener('create-followup', onFollow);
      window.removeEventListener('open-task-details', onOpen as EventListener);
    };
  }, []);

  // Categorize tasks by day buckets
  const { yesterday, today, tomorrow, overdue } = useMemo(() => {
    const all = Object.values(tasksMap);
    const match = (t: any) => !search || t.title.toLowerCase().includes(search) || (t.description ?? '').toLowerCase().includes(search);
    const filtered = all.filter((t) => match(t) && !(hideDone && t.checked));
    const y = startOfDay(addDays(new Date(), -1));
    const t0 = startOfDay(new Date());
    const t1 = startOfDay(addDays(new Date(), 1));
    const res = { yesterday: [] as any[], today: [] as any[], tomorrow: [] as any[], overdue: [] as any[] };
    for (const t of filtered) {
      const s = t.start ? new Date(t.start) : undefined;
      const e = t.end ? new Date(t.end) : undefined;
      const day = s || e || new Date();
      if (isSameDay(day, t0)) res.today.push(t);
      else if (isSameDay(day, y)) res.yesterday.push(t);
      else if (isSameDay(day, t1)) res.tomorrow.push(t);
      else if (!t.checked && e && isBefore(e, startOfDay(new Date()))) res.overdue.push(t);
    }
    const timeAsc = (a: any, b: any) => (new Date(a.start || a.end || 0).getTime()) - (new Date(b.start || b.end || 0).getTime());
    const withDoneBottom = (asc = true) => (a: any, b: any) => {
      if (!!a.checked !== !!b.checked) return a.checked ? 1 : -1; // unchecked first
      return asc ? timeAsc(a, b) : timeAsc(b, a);
    };
    res.yesterday.sort(withDoneBottom(true));
    res.today.sort(withDoneBottom(true));
    res.tomorrow.sort(withDoneBottom(true));
    // default overdue: descending by time, but done still pushed to bottom
    res.overdue.sort(withDoneBottom(false));
    return res;
  }, [tasksMap, search, hideDone]);

  const gridCols = 'md:grid-cols-4';
  return (
    <div id="kanban-root" className={`grid grid-cols-1 ${gridCols} gap-4 h-full min-h-0 overflow-hidden items-stretch`}>
      <DndContext sensors={sensors} onDragEnd={async (e: DragEndEvent) => {
        const activeId = String(e.active.id);
        const overId = e.over ? String(e.over.id) : '';
        if (!overId.startsWith('column:')) return;
        const target = overId.split(':')[1] as 'yesterday'|'today'|'tomorrow'|'overdue';
        const task = useStore.getState().tasks[activeId];
        if (!task) return;
        const base = target === 'yesterday' ? startOfDay(addDays(new Date(), -1)) : target === 'today' ? startOfDay(new Date()) : target === 'tomorrow' ? startOfDay(addDays(new Date(), 1)) : startOfDay(addDays(new Date(), -1));
        const dur = task.start && task.end ? (new Date(task.end).getTime() - new Date(task.start).getTime()) : (30 * 60 * 1000);
        let startISO: string | undefined;
        let endISO: string | undefined;
        if (task.allDay) {
          const s = new Date(base);
          const e = new Date(base.getTime() + 24 * 60 * 60 * 1000);
          startISO = s.toISOString();
          endISO = e.toISOString();
        } else if (task.start) {
          const startOld = new Date(task.start);
          const s = new Date(base);
          s.setHours(startOld.getHours(), startOld.getMinutes(), 0, 0);
          const e = new Date(s.getTime() + dur);
          startISO = s.toISOString();
          endISO = e.toISOString();
        } else if (task.end) {
          const endOld = new Date(task.end);
          const e = new Date(base);
          e.setHours(endOld.getHours(), endOld.getMinutes(), 0, 0);
          const s = new Date(e.getTime() - dur);
          startISO = s.toISOString();
          endISO = e.toISOString();
        } else {
          const s = new Date(base);
          const e = new Date(s.getTime() + dur);
          startISO = s.toISOString();
          endISO = e.toISOString();
        }
        await updateTask(activeId, { start: startISO, end: endISO });
      }}>
        <Column tone="yellow" id="yesterday" title="Yesterday" icon={<Sunset className="w-4 h-4"/>} items={yesterday} onOpen={openDrawer} onToggle={toggleChecked} />
        <Column tone="blue" id="today" title="Today" icon={<Sun className="w-4 h-4"/>} items={today} onOpen={openDrawer} onToggle={toggleChecked}
          headerRight={<button className="btn btn-icon" aria-label="Quick Add" title="Quick Add" onClick={() => openQuickAdd('')}> <Plus className="w-4 h-4"/></button>} />
        <Column tone="gray" id="tomorrow" title="Tomorrow" icon={<Sunrise className="w-4 h-4"/>} items={tomorrow} onOpen={openDrawer} onToggle={toggleChecked} />
        <Column tone="rose" id="overdue" title="Overdue" icon={<AlertTriangle className="w-4 h-4"/>} items={overdue.slice().sort((a,b)=> {
            const cmp = overdueAsc ? (new Date(a.end||a.start||0).getTime())-(new Date(b.end||b.start||0).getTime()) : (new Date(b.end||b.start||0).getTime())-(new Date(a.end||a.start||0).getTime());
            if (!!a.checked !== !!b.checked) return a.checked ? 1 : -1;
            return cmp;
          })} onOpen={openDrawer} onToggle={toggleChecked}
          headerRight={<button className="btn btn-icon" aria-label="Toggle sort" title={overdueAsc ? 'Ascending' : 'Descending'} onClick={() => setOverdueAsc((v)=>!v)}><ArrowUpDown className="w-4 h-4"/></button>} />
        <TaskDetailsDrawer open={drawerOpen} taskId={drawerTask} onClose={() => setDrawerOpen(false)} />
      </DndContext>
    </div>
  );
}

type Tone = 'yellow'|'blue'|'gray'|'rose';
function toneClasses(tone: Tone) {
  switch (tone) {
    case 'yellow': return { bg: 'bg-yellow-50 dark:bg-yellow-900/15', border: 'border-yellow-200 dark:border-yellow-800', headerBg: 'bg-yellow-50/90 dark:bg-yellow-900/20', headerBorder: 'border-yellow-200/70 dark:border-yellow-800' };
    case 'blue': return { bg: 'bg-blue-50 dark:bg-blue-900/15', border: 'border-blue-200 dark:border-blue-800', headerBg: 'bg-blue-50/90 dark:bg-blue-900/20', headerBorder: 'border-blue-200/60 dark:border-blue-800' };
    case 'gray': return { bg: 'bg-gray-50 dark:bg-slate-800/30', border: 'border-gray-200 dark:border-slate-700', headerBg: 'bg-gray-50/90 dark:bg-slate-900/30', headerBorder: 'border-gray-200/60 dark:border-slate-700' };
    case 'rose': return { bg: 'bg-rose-50 dark:bg-rose-900/15', border: 'border-rose-200 dark:border-rose-800', headerBg: 'bg-rose-50/90 dark:bg-rose-900/20', headerBorder: 'border-rose-200/60 dark:border-rose-800' };
  }
}

function Column({ id, title, items, onToggle, onOpen, tone, headerRight, icon }: { id: 'yesterday'|'today'|'tomorrow'|'overdue'; title: string; items: any[]; onToggle: (id: string) => void; onOpen: (id: string) => void; tone: Tone; headerRight?: ReactNode; icon?: ReactNode }) {
  const cls = toneClasses(tone);
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}` });
  const [scrolled, setScrolled] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget as HTMLDivElement;
    const st = el.scrollTop || 0;
    const canScrollDown = st + el.clientHeight < el.scrollHeight - 1;
    setScrolled(st > 0);
    setAtTop(st <= 0);
    setAtBottom(!canScrollDown);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const st = el.scrollTop;
    setScrolled(st > 0);
    setAtTop(st <= 0);
    setAtBottom(st + el.clientHeight >= el.scrollHeight - 1);
  }, []);
  const openAdd = () => { openQuickAdd(''); };
  return (
    <div ref={setNodeRef} className={`rounded-2xl h-full max-h-full overflow-hidden flex flex-col border ${cls.border} ${cls.bg} ${isOver ? 'ring-2 ring-blue-400' : ''}`} aria-label={`${title} column`}>
      {/* Fixed header (outside scroller) ensures perfect alignment across columns */}
      <div className={`px-3 h-12 flex items-center justify-between ${cls.headerBg} ${scrolled ? `shadow-sm border-b ${cls.headerBorder}` : ''} backdrop-blur supports-[backdrop-filter]:bg-white/40 dark:supports-[backdrop-filter]:bg-slate-900/30`}>
        <h3 className="font-semibold flex items-center gap-2">{icon}{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{items.length}</span>
          {headerRight ?? (id === 'today' ? (<button className="btn btn-icon" aria-label={`Add to ${title}`} onClick={openAdd}><Plus className="w-4 h-4"/></button>) : null)}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <div className="relative h-full">
          {/* Top fade */}
          <div className={`pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-black/30 to-transparent dark:from-black/50 transition-opacity duration-150 ${atTop ? 'opacity-0' : 'opacity-100'}`} />
          {/* Bottom fade */}
          <div className={`pointer-events-none absolute left-0 right-0 bottom-0 h-6 bg-gradient-to-t from-black/30 to-transparent dark:from-black/50 transition-opacity duration-150 ${atBottom ? 'opacity-0' : 'opacity-100'}`} />
          <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto thin-scrollbar p-3">
            <div className="space-y-2 pt-1">
              {items.length === 0 && (
                <div className="card px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400 border border-dashed dark:border-slate-600">
                  No tasks here.
                </div>
              )}
              <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy} id={`column:${id}`}>
                {items.map((t) => (
                  <SortableItem key={t.id} id={t.id}>
                    <TaskCard task={t} onToggle={onToggle} onOpen={onOpen} showFullDate={id === 'overdue'} />
                  </SortableItem>
                ))}
              </SortableContext>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
