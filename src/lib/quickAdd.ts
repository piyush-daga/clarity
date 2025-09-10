export type QuickAddOpen = (prefill?: string) => void;

let opener: QuickAddOpen | null = null;

export function registerQuickAddOpen(fn: QuickAddOpen) {
  opener = fn;
}

export function openQuickAdd(prefill?: string) {
  if (opener) opener(prefill);
}

