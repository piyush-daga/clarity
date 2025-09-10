'use client';
import { useEffect, useState } from 'react';
import { onToast } from '@/lib/toast';

export default function Toaster() {
  const [msgs, setMsgs] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    return onToast((m) => {
      setMsgs((prev) => [...prev, m]);
      setTimeout(() => setMsgs((prev) => prev.filter((x) => x.id !== m.id)), 3000);
    });
  }, []);
  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {msgs.map((m) => (
        <div key={m.id} className="card px-4 py-2 text-sm">{m.text}</div>
      ))}
    </div>
  );
}

