'use client';
import Header from '@/components/Header';
import QuickAdd from '@/components/QuickAdd';
import { useEffect, useState } from 'react';
import { setupSWClient } from '@/lib/sw-client';
import { toast } from '@/lib/toast';
import { registerQuickAddOpen } from '@/lib/quickAdd';
import { useStore } from '@/store';

export default function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialText, setInitialText] = useState('');

  const toggleHideDone = useStore((s) => s.toggleHideDone);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        setInitialText('');
        setOpen(true);
      }
      // Shift+D toggles hide done
      if (e.shiftKey && key === 'd') {
        e.preventDefault();
        toggleHideDone();
      }
    };
    window.addEventListener('keydown', onKey);
    registerQuickAddOpen((prefill) => {
      setInitialText(prefill ?? '');
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
      <Header onQuickAdd={() => { setInitialText(''); setOpen(true); }} />
      {children}
      <QuickAdd open={open} initialText={initialText} onClose={() => setOpen(false)} />
    </>
  );
}
