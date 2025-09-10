export function setAppBackgroundByDate(date: Date) {
  if (typeof document === 'undefined') return;
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const dark = document.documentElement.classList.contains('dark');
  const url = dark ? `/backgrounds/rich-dark/month-${m}.svg` : `/backgrounds/rich/month-${m}.svg`;
  document.documentElement.style.setProperty('--clarity-app-bg', `url(${url})`);
}

export function setAppBackgroundUrl(url: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--clarity-app-bg', `url(${url})`);
}
