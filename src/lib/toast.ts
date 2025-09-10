type ToastMessage = { id: string; text: string };

const eventName = 'clarity:toast';

export function toast(text: string) {
  if (typeof window === 'undefined') return;
  const detail: ToastMessage = { id: crypto.randomUUID(), text };
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function onToast(handler: (msg: ToastMessage) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<ToastMessage>).detail);
  window.addEventListener(eventName, listener as EventListener);
  return () => window.removeEventListener(eventName, listener as EventListener);
}

