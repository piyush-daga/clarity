'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/store';
import { buildCSV, buildICS, downloadCSV, downloadICS, filenameDateStamp } from '@/lib/export';
import { isWithinInterval, parseISO } from 'date-fns';

type Props = { open: boolean; onClose: () => void };

export default function ExportModal({ open, onClose }: Props) {
  const tasks = useStore((s) => Object.values(s.tasks));
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [includeTodos, setIncludeTodos] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);

  const filtered = useMemo(() => {
    if (!from || !to) return tasks;
    const range = { start: new Date(from), end: new Date(to) };
    return tasks.filter((t) => {
      if (t.start && t.end) {
        return isWithinInterval(parseISO(t.start), range) || isWithinInterval(parseISO(t.end), range);
      }
      return true;
    });
  }, [tasks, from, to]);

  const exportICS = () => {
    const events = includeEvents ? filtered.filter((t) => t.isEvent) : [];
    const todos = includeTodos ? filtered.filter((t) => !t.isEvent) : [];
    const ics = buildICS({ events, todos });
    downloadICS(ics, `clarity-${filenameDateStamp()}`);
  };
  const exportCSV = () => {
    const csv = buildCSV(filtered);
    downloadCSV(csv, `clarity-${filenameDateStamp()}`);
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4">
      <div className="card w-full max-w-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Export</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-300">From</label>
            <input type="datetime-local" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-300">To</label>
            <input type="datetime-local" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm">
          <label className="inline-flex items-center gap-2"><input className="checkbox-circle" type="checkbox" checked={includeTodos} onChange={(e) => setIncludeTodos(e.target.checked)} />Include tasks (VTODO)</label>
          <label className="inline-flex items-center gap-2"><input className="checkbox-circle" type="checkbox" checked={includeEvents} onChange={(e) => setIncludeEvents(e.target.checked)} />Include events (VEVENT)</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn" onClick={exportCSV}>Download CSV</button>
          <button className="btn-primary" onClick={exportICS}>Download ICS</button>
        </div>
      </div>
    </div>
  );
}
