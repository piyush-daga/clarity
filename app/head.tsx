import { inlineInitThemeScript } from '@/lib/theme';

export default function Head() {
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const initBg = `/backgrounds/rich/month-${m}.svg`;
  const initBgDark = `/backgrounds/rich-dark/month-${m}.svg`;
  const init = `(() => { try {
    ${inlineInitThemeScript()}
    var dark = document.documentElement.classList.contains('dark');
    var url = dark ? '${initBgDark}' : '${initBg}';
    document.documentElement.style.setProperty('--clarity-app-bg', 'url(' + url + ')');
  } catch (e) {} })();`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: init }} />
    </>
  );
}

