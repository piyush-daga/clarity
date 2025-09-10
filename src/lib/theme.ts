export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'clarity:theme';

export function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const t = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return t === 'light' || t === 'dark' || t === 'system' ? t : null;
}

export function resolveTheme(pref?: Theme): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = pref ?? getStoredTheme() ?? 'system';
  if (stored === 'light' || stored === 'dark') return stored;
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

import { setAppBackgroundByDate } from '@/lib/app-background';

export function applyTheme(next: Theme | 'toggle') {
  if (typeof document === 'undefined') return;
  let current: Theme = getStoredTheme() ?? 'system';
  let target: Theme;
  if (next === 'toggle') {
    // Toggle explicitly between light and dark (ignore system)
    const effective = resolveTheme(current);
    target = effective === 'dark' ? 'light' : 'dark';
  } else {
    target = next;
  }

  try { localStorage.setItem(STORAGE_KEY, target); } catch {}

  const effective = resolveTheme(target);
  document.documentElement.classList.toggle('dark', effective === 'dark');
  document.documentElement.style.colorScheme = effective;

  // Update theme-color meta for better iOS/Android appearance
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (meta) meta.content = effective === 'dark' ? '#0b1730' : '#f2f3f5';

  // Sync background artwork variant without changing the month
  try {
    const rs = getComputedStyle(document.documentElement);
    const cur = rs.getPropertyValue('--clarity-app-bg') || '';
    const m = /month-(\d{2})\.svg/.exec(cur)?.[1] || monthIndexFromDate(new Date());
    const path = effective === 'dark' ? `/backgrounds/rich-dark/month-${m}.svg` : `/backgrounds/rich/month-${m}.svg`;
    document.documentElement.style.setProperty('--clarity-app-bg', `url(${path})`);
  } catch {}

  // Notify listeners
  try { window.dispatchEvent(new CustomEvent('clarity-theme-changed', { detail: { theme: effective } })); } catch {}
}

function monthIndexFromDate(d: Date): string {
  const i = isNaN(d.getTime()) ? new Date() : d;
  return String(i.getMonth() + 1).padStart(2, '0');
}

// Inline-friendly function to run as early as possible
export function inlineInitThemeScript(): string {
  return `(() => { try {\n    const key = '${STORAGE_KEY}';\n    let pref = localStorage.getItem(key);\n    if (pref !== 'light' && pref !== 'dark' && pref !== 'system') pref = 'system';\n    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;\n    const eff = (pref === 'dark' || (pref === 'system' && sysDark)) ? 'dark' : 'light';\n    document.documentElement.classList.toggle('dark', eff === 'dark');\n    document.documentElement.style.colorScheme = eff;\n  } catch {} })();`;
}
