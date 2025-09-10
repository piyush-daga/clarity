import { Task } from '@/types';
import { formatISO9075 } from 'date-fns';
import { saveAs } from 'file-saver';

function toICSDate(iso: string): string {
  const d = new Date(iso);
  // UTC Z format YYYYMMDDTHHmmssZ
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function buildICS({ events, todos }: { events: Task[]; todos: Task[] }): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Clarity//EN');
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@clarity.local`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    if (ev.start) lines.push(`DTSTART:${toICSDate(ev.start)}`);
    if (ev.end) lines.push(`DTEND:${toICSDate(ev.end)}`);
    lines.push('END:VEVENT');
  }
  for (const td of todos) {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${td.id}@clarity.local`);
    lines.push(`SUMMARY:${escapeICS(td.title)}`);
    if (td.description) lines.push(`DESCRIPTION:${escapeICS(td.description)}`);
    if (td.end) lines.push(`DUE:${toICSDate(td.end)}`);
    lines.push(`STATUS:${td.checked ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    lines.push('END:VTODO');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\n');
}

export function downloadICS(ics: string, filenameBase: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  saveAs(blob, `${filenameBase}.ics`);
}

export function buildCSV(rows: Task[]): string {
  const header = 'id,title,stage,start,end,checked,parentId,calendarId';
  const escape = (val: string | number | boolean | null | undefined): string => {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = rows.map((t) => [t.id, t.title, t.stage, t.start ?? '', t.end ?? '', t.checked, t.parentId ?? '', t.calendarId].map(escape).join(','));
  return [header, ...lines].join('\n');
}

export function downloadCSV(csv: string, filenameBase: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filenameBase}.csv`);
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function filenameDateStamp(d = new Date()): string {
  return formatISO9075(d, { representation: 'date' }).replace(/-/g, '');
}
