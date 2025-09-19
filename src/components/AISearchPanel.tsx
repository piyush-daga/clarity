'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { LS_AI_KEY, LS_AI_MODEL, DEFAULT_MODEL_ID } from '@/lib/ai';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  query: string;
  onClose: () => void;
};

type AISearchResult = {
  matchedIds: string[];
  summary: string;
  groups?: { title: string; ids: string[] }[];
};

export default function AISearchPanel({ open, query, onClose }: Props) {
  const tasksMap = useStore((s) => s.tasks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AISearchResult | null>(null);

  const tasksForAI = useMemo(() => {
    // Keep payload compact, include key fields only
    return Object.values(tasksMap).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      stage: t.stage,
      checked: !!t.checked,
      start: t.start || null,
      end: t.end || null,
      allDay: !!t.allDay,
      isEvent: !!t.isEvent,
      completedAt: t.completedAt || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }, [tasksMap]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const apiKey = (() => { try { return localStorage.getItem(LS_AI_KEY) || ''; } catch { return ''; } })();
        const model = (() => { try { return localStorage.getItem(LS_AI_MODEL) || DEFAULT_MODEL_ID; } catch { return DEFAULT_MODEL_ID; } })();
        if (!apiKey) { setError('Add a Gemini API key in Settings.'); setLoading(false); return; }
        const now = new Date().toISOString();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const sys = SYSTEM_PROMPT;
        const user = `now: ${now}\ntimezone: ${tz}\nquery: ${query}\ntasks: ${JSON.stringify(tasksForAI)}`;
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, apiKey, messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ] }),
        });
        const data = await resp.json();
        if (!data?.ok) throw new Error(data?.error || 'AI request failed');
        const parsed = looseParseJSON(String(data.content || ''));
        const normalized = normalizeResult(parsed);
        if (!normalized) {
          throw new Error('Unexpected AI response. Try refining your query.');
        }
        setResult(normalized);
      } catch (e) {
        setError((e as Error).message || 'Failed to run AI search');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, query, tasksForAI]);

  const matched = useMemo(() => {
    const ids = new Set(result?.matchedIds || []);
    return Array.from(ids).map((id) => tasksMap[id]).filter(Boolean);
  }, [result, tasksMap]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    if (open) window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">AI Search</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Query: <span className="font-medium">{query || '—'}</span></div>

        {loading && (
          <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300">
            <div className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Analyzing…</div>
          </div>
        )}

        {error && !loading && (
          <div className="p-3 rounded-xl border border-rose-200 dark:border-transparent bg-rose-50/60 dark:bg-rose-950/20 text-sm text-rose-700 dark:text-rose-300">{error}</div>
        )}

        {!loading && !error && result && (
          <div className="space-y-3">
            {result.summary && (
              <div className="prose dark:prose-invert max-w-none text-sm">
                <ReactMarkdown>{result.summary}</ReactMarkdown>
              </div>
            )}

            {result.groups && result.groups.length > 0 ? (
              <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                {result.groups.map((g, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-gray-200 dark:border-transparent">
                    <div className="font-medium mb-2">{g.title}</div>
                    <TaskList ids={g.ids} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
                <TaskList ids={(result.matchedIds || [])} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskList({ ids }: { ids: string[] }) {
  const tasks = useStore((s) => s.tasks);
  const items = ids.map((id) => tasks[id]).filter(Boolean);
  if (!items.length) return <div className="text-sm text-gray-500">No matching tasks.</div>;
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <button key={t.id} className="w-full text-left p-2 rounded-lg border border-gray-200 dark:border-transparent hover:bg-gray-50 dark:hover:bg-slate-800/50" onClick={() => {
          try { window.dispatchEvent(new CustomEvent('open-task-details', { detail: { id: t.id } })); } catch {}
        }}>
          <div className="font-medium">{t.title}</div>
          <div className="text-xs text-gray-500">{t.checked ? 'Done' : 'Open'}{renderWhen(t.start, t.end, t.allDay)}</div>
        </button>
      ))}
    </div>
  );
}

function renderWhen(start?: string, end?: string, allDay?: boolean) {
  if (!start && !end) return null;
  try {
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    if (allDay && s) return <span>{' • '}{s.toDateString()}</span>;
    if (s && e) return <span>{' • '}{s.toLocaleString()} – {e.toLocaleTimeString()}</span>;
    if (s) return <span>{' • '}{s.toLocaleString()}</span>;
    if (e) return <span>{' • '}due {e.toLocaleString()}</span>;
  } catch {}
  return null;
}

function normalizeResult(raw: any): AISearchResult | null {
  try {
    const matched = Array.isArray(raw?.matchedIds) ? raw.matchedIds.map((x: any) => String(x)).filter(Boolean) : [];
    const summary = typeof raw?.summary === 'string' ? raw.summary : '';
    const groupsRaw: any[] = Array.isArray(raw?.groups) ? raw.groups : [];
    const groups = groupsRaw.map((g) => ({ title: String(g?.title || '').trim() || 'Group', ids: Array.isArray(g?.ids) ? g.ids.map((x: any) => String(x)).filter(Boolean) : [] }))
      .filter((g) => g.ids.length > 0);
    return { matchedIds: matched, summary, groups: groups.length ? groups : undefined };
  } catch { return null; }
}

function looseParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  try { const i = s.indexOf('{'); const j = s.lastIndexOf('}'); if (i>=0 && j>i) return JSON.parse(s.slice(i, j+1)); } catch {}
  return null;
}

const SYSTEM_PROMPT = `You are a smart task search assistant.
Return ONLY JSON with this schema:
{
  "matchedIds": string[],
  "summary": string,
  "groups"?: [ { "title": string, "ids": string[] } ]
}

Instructions:
- Use the provided tasks array (with id, title, description, stage, checked, start, end, completedAt, createdAt, updatedAt) and the natural‑language query to select matching task ids.
- Interpret relative dates using the provided now and timezone.
- Prefer inclusive logic: if the query is ambiguous like "tasks in last week", match tasks whose start/end OR completedAt fall within the last 7 days. If a task has no dates, include it only if its createdAt/updatedAt is in range or the text clearly matches the query.
- Stage semantics: stage "done" or checked=true means completed.
- Do not invent ids.
- Write a helpful, concise summary (2–6 lines). Include counts and notable groupings (e.g., by day or status). Use simple Markdown for readability.
- If useful, include groups to cluster ids by day/status/etc.
`;
