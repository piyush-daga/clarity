import Link from 'next/link';
import { CalendarDays, Settings, Plus, Search, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import React from 'react';
import { useStore } from '@/store';
import { applyTheme } from '@/lib/theme';

type Props = { onQuickAdd: () => void };

export default function Header({ onQuickAdd }: Props) {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const [focused, setFocused] = React.useState(false);
  const [isDark, setIsDark] = React.useState(false);
  const hideDone = useStore((s) => s.hideDone);
  const toggleHideDone = useStore((s) => s.toggleHideDone);
  React.useEffect(() => {
    // Use the actual applied class on <html> as source of truth
    const read = () => {
      try { return document.documentElement.classList.contains('dark'); } catch { return false; }
    };
    setIsDark(read());
    const onChange = () => setIsDark(read());
    const onTheme = () => setIsDark(read());
    try {
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onChange);
    } catch {}
    window.addEventListener('clarity-theme-changed', onTheme as EventListener);
    return () => {
      try { if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', onChange); } catch {}
      window.removeEventListener('clarity-theme-changed', onTheme as EventListener);
    };
  }, []);

  return (
    <header className="w-full sticky top-0 z-30 bg-transparent backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-blue-600" />
          <Link href="/" className="text-lg font-semibold">Clarity</Link>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`hidden md:flex items-center gap-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 px-3 h-10 transition-all duration-300 ease-out ${focused ? 'w-[70vw] lg:w-[560px] xl:w-[720px]' : 'w-[260px] lg:w-[320px]'}`}
          >
            <Search className="w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="outline-none text-sm placeholder:text-gray-400 bg-transparent text-current w-full min-w-0"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
          <button className="btn btn-icon btn-ghost" aria-label={hideDone ? 'Show done' : 'Hide done'} title={hideDone ? 'Show Done (Shift+D)' : 'Hide Done (Shift+D)'} onClick={toggleHideDone}>
            {hideDone ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
          </button>
          <button className="btn btn-icon btn-ghost" aria-label="Toggle theme" title="Toggle theme"
            onClick={() => { applyTheme('toggle'); try { setIsDark(document.documentElement.classList.contains('dark')); } catch {} }}>
            {isDark ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
          </button>
          <button className="btn btn-icon btn-primary" onClick={onQuickAdd} aria-label="Open Quick Add (Cmd/Ctrl+K)" title="Quick Add"><Plus className="w-4 h-4"/></button>
          <Link href="/settings" className="btn" aria-label="Settings"><Settings className="w-4 h-4"/>Settings</Link>
        </div>
      </div>
    </header>
  );
}
