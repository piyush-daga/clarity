export type QuickAddOpen = (prefill?: string, options?: { mode?: 'quick'|'notes' }) => void;

let opener: QuickAddOpen | null = null;

export function registerQuickAddOpen(fn: QuickAddOpen) {
  opener = fn;
}

export function openQuickAdd(prefill?: string, options?: { mode?: 'quick'|'notes' }) {
  if (opener) opener(prefill, options);
}
