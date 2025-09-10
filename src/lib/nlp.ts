import { parse, ParsedResult } from 'chrono-node';
import { addHours } from 'date-fns';
import { Task, Stage } from '@/types';

export function parseQuickInput(text: string): { task: Partial<Task>, errors?: string[] } {
  const errors: string[] = [];
  let remaining = text.trim();
  const task: Partial<Task> = { stage: 'todo', checked: false, calendarId: 'local' } as Partial<Task>;

  // Stage tokens (map any @in-progress to 'todo')
  const stageMatch = remaining.match(/@(todo|in-progress|done)\b/i);
  if (stageMatch) {
    const raw = stageMatch[1].toLowerCase();
    task.stage = (raw === 'done' ? 'done' : 'todo') as Stage;
    remaining = remaining.replace(stageMatch[0], '').trim();
  }

  // Color tokens removed

  // Event flag
  const eventMatch = remaining.match(/!event\b/i);
  if (eventMatch) {
    task.isEvent = true;
    remaining = remaining.replace(eventMatch[0], '').trim();
  }

  // Title handling: quoted
  const quoted = remaining.match(/^[“"]([^”"]+)[”"]/);
  if (quoted) {
    task.title = quoted[1].trim();
    remaining = remaining.replace(quoted[0], '').trim();
  }

  // Date parsing via chrono
  const results: ParsedResult[] = parse(remaining);
  if (results.length > 0) {
    const r = results[0];
    const startDate = r.start?.date();
    const endDate = r.end?.date();
    if (startDate) {
      task.start = startDate.toISOString();
      if (endDate) {
        task.end = endDate.toISOString();
      } else {
        const duration = addHours(startDate, 1);
        task.end = duration.toISOString();
      }
      task.isEvent = task.isEvent ?? true; // if date detected, default to event
      // remove matched date text from remaining
      remaining = (remaining.slice(0, r.index) + remaining.slice((r.index ?? 0) + r.text.length)).trim();
    }
  }

  // Remaining as title if title not set
  if (!task.title) {
    const cleaned = remaining.replace(/\s{2,}/g, ' ').trim();
    if (cleaned.length === 0) errors.push('Title required');
    task.title = cleaned || 'Untitled';
  }

  // If isEvent but no date, default to now -> +1h
  if (task.isEvent && !task.start) {
    const now = new Date();
    task.start = now.toISOString();
    task.end = addHours(now, 1).toISOString();
  }

  return { task, errors: errors.length ? errors : undefined };
}
