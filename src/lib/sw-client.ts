export function setupSWClient(onUpdate: () => void) {
  if (typeof window === 'undefined') return;
  // Best-effort Serwist window hook (optional)
  import('@serwist/window').then(() => {
    // No-op; presence of package ensures compatibility if used later.
  }).catch(() => {});

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      onUpdate();
    });
  }
}

