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
      const hasTime = r.start.isCertain('hour') || r.start.isCertain('minute') || r.start.isCertain('second');
      if (hasTime) {
        // Timed event: preserve parsed times
        let startDT = startDate;
        let endDT = endDate ?? addHours(startDate, 1);
        // If a range like "11pm-1am" was parsed to same-day with end before start, roll end to next day.
        if (endDate && endDT.getTime() <= startDT.getTime()) {
          if (endDT.getHours() < startDT.getHours()) {
            endDT = new Date(endDT.getTime() + 24 * 60 * 60 * 1000);
          } else {
            // Equal or ambiguous: ensure at least 1h duration
            endDT = addHours(startDT, 1);
          }
        }
        task.start = startDT.toISOString();
        task.end = endDT.toISOString();
        task.allDay = false;
      } else {
        // Date-only: treat as all-day
        const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        task.start = dayStart.toISOString();
        // If an end date was provided, end is day after that date; else one day
        if (endDate) {
          const endStart = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0, 0);
          task.end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
        } else {
          task.end = dayEnd.toISOString();
        }
        task.allDay = true;
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

  // If isEvent but no date, default to now -> +1h timed event
  if (task.isEvent && !task.start) {
    const now = new Date();
    task.start = now.toISOString();
    task.end = addHours(now, 1).toISOString();
    task.allDay = false;
  }

  return { task, errors: errors.length ? errors : undefined };
}

export type ParsedHint = { start: number; end: number; text: string; kind: 'date' | 'time' | 'datetime' };

// Extract human-friendly hints for what parts of the text contributed to date/time parsing.
export function extractDateTimeHints(input: string): ParsedHint[] {
  const results: ParsedResult[] = parse(input);
  if (!results.length) return [];
  const hints: ParsedHint[] = [];
  for (const r of results) {
    const idx = r.index ?? 0;
    const full = r.text ?? input.slice(idx, idx + 1);
    const baseKind: ParsedHint['kind'] = (r.start?.isCertain('hour') || r.start?.isCertain('minute') || r.start?.isCertain('second')) ? 'datetime' : 'date';

    // Try to tease out more granular time and date tokens from the matched text.
    // 1) Time ranges or single times (includes @2pm, 2pm, 14:30, noon, midnight)
    const timeRegexes = [
      /@\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
      /\b\d{1,2}\s*(?:am|pm)\b/gi,
      /\b\d{1,2}:\d{2}\b/gi,
      /\b(noon|midnight)\b/gi,
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[\-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi,
    ];
    const dateRegexes = [
      /\b(today|tomorrow|yesterday)\b/gi,
      /\b(mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/gi,
      /\b(next\s+(?:week|month|year))\b/gi,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi,
    ];

    const localHints: ParsedHint[] = [];
    const pushMatches = (regex: RegExp, kind: ParsedHint['kind']) => {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(full)) != null) {
        const relStart = m.index;
        const relEnd = m.index + m[0].length;
        localHints.push({ start: idx + relStart, end: idx + relEnd, text: m[0], kind });
      }
    };
    for (const re of timeRegexes) pushMatches(new RegExp(re.source, re.flags), 'time');
    for (const re of dateRegexes) pushMatches(new RegExp(re.source, re.flags), 'date');

    // If nothing granular found, fallback to whole match as a single hint
    if (!localHints.length) {
      hints.push({ start: idx, end: idx + full.length, text: full, kind: baseKind });
    } else {
      hints.push(...localHints);
    }
  }

  // Merge overlapping/duplicate hints and sort by start
  const merged = mergeHints(hints);
  return merged;
}

function mergeHints(hints: ParsedHint[]): ParsedHint[] {
  if (!hints.length) return [];
  const byKey = new Map<string, ParsedHint>();
  for (const h of hints) {
    const key = `${h.start}-${h.end}-${h.kind}-${h.text.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, h);
  }
  const arr = Array.from(byKey.values()).sort((a, b) => a.start - b.start || a.end - b.end);
  // Optionally: join adjacent same-kind spans with 1-char gaps, but keep simple for clarity.
  return arr;
}
