'use client';
import Header from '@/components/Header';
import QuickAdd from '@/components/QuickAdd';
import { useEffect, useState } from 'react';
import { setupSWClient } from '@/lib/sw-client';
import { toast } from '@/lib/toast';
import { registerQuickAddOpen } from '@/lib/quickAdd';

export default function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialText, setInitialText] = useState('');
  const [initialMode, setInitialMode] = useState<'quick'|'notes'>('quick');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        // Toggle Quick Add on Cmd/Ctrl+K
        setOpen((prev) => {
          if (prev) return false; // close if already open
          setInitialText('');
          setInitialMode('quick');
          return true; // open otherwise
        });
      }
    };
    window.addEventListener('keydown', onKey);
    registerQuickAddOpen((prefill, options) => {
      setInitialText(prefill ?? '');
      setInitialMode(options?.mode || 'quick');
      setOpen(true);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      registerQuickAddOpen(() => {});
    };
  }, []);

  useEffect(() => {
    setupSWClient(() => toast('An update is available. Reload to apply.'));
  }, []);

  return (
    <>
      <Header onQuickAdd={() => { setInitialText(''); setInitialMode('quick'); setOpen(true); }} />
      {children}
      <QuickAdd open={open} initialText={initialText} initialMode={initialMode} onClose={() => setOpen(false)} />
    </>
  );
}
