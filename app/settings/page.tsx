'use client';
import { useEffect, useState } from 'react';
import ExportModal from '@/components/ExportModal';
import { useStore } from '@/store';
import { toast } from '@/lib/toast';
import { isGoogleEnabled } from '@/lib/google';

export default function SettingsPage() {
  const [exportOpen, setExportOpen] = useState(false);
  const createTask = useStore((s) => s.createTask);
  const refresh = useStore((s) => s.refresh);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result || '');
        const rows = csvToRows(text);
        const header = rows.shift() || [];
        const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
        const titleIdx = idx('title');
        if (titleIdx === -1) throw new Error('CSV must include a "title" column.');
        let created = 0;
        for (const r of rows) {
          const get = (n: string) => {
            const i = idx(n);
            return i >= 0 ? r[i] : '';
          };
          const title = r[titleIdx];
          if (!title) continue;
          const stage = (get('stage') || 'todo') as any;
          const start = get('start') || undefined;
          const end = get('end') || undefined;
          const checked = parseBool(get('checked')) || false;
          const parentId = get('parentId') || null;
          const calendarId = get('calendarId') || 'local';
          await (createTask as any)({
            title,
            description: undefined,
            stage,
            checked,
            start,
            end,
            allDay: false,
            hiddenOnCalendar: false,
            linkedTo: undefined,
            parentId,
            subTasks: undefined,
            calendarId,
          });
          created++;
        }
        toast(`Imported ${created} tasks.`);
        await (refresh as any)();
      } catch (err) {
        toast(`Import failed: ${(err as Error).message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="py-6">
      <div className="card p-4">
        <h1 className="text-lg font-semibold mb-3">Settings</h1>
        <div className="space-y-4">
          {isGoogleEnabled() && (
            <button className="btn" onClick={() => alert('Connect Google Calendar (beta) is not available in local mode.')}>Connect Google Calendar (beta)</button>
          )}
          <div>
            <button className="btn" onClick={() => setExportOpen(true)}>Export…</button>
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
            <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV…</button>
          </div>
        </div>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function useRef<T>(initial: T | null) {
  const [ref] = useState({ current: initial } as { current: T | null });
  return ref;
}

function parseBool(val: string | undefined): boolean | undefined {
  if (val == null) return undefined;
  const s = val.trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return undefined;
}

 

function csvToRows(csv: string): string[][] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  });
}
