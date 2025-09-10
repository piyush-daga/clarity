'use client';
import { useStore } from '@/store';

export default function CalendarsPanel() {
  const calendars = useStore((s) => s.calendars);
  const toggle = useStore((s) => s.toggleCalendarEnabled);
  return (
    <aside className="card p-4">
      <h2 className="font-medium mb-3">Calendars</h2>
      <div className="space-y-2">
        {calendars.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input className="checkbox-circle" type="checkbox" checked={!!c.enabled} disabled={!!c.readOnly} onChange={(e) => toggle(c.id, e.target.checked)} />
            <span>{c.title} {c.readOnly && <em className="text-gray-400">(read-only)</em>}</span>
          </label>
        ))}
      </div>
    </aside>
  );
}
