import type { Locale } from '@/types';

export const demoLocaleKey = 'livestocks:demo:entry-locale';

// Let static entry shells pick the correct reading direction before hydration.
export function entryLocaleInitScript(development: boolean) {
  return `(()=>{try{const demo=${development ? "localStorage.getItem('" + demoLocaleKey + "')" : 'null'};
    document.documentElement.dataset.entryLocale=(demo==='he'||demo==='en'?demo:localStorage.getItem('locale'))==='en'?'en':'he'}catch{}})();`;
}

export function readDemoEntryLocale(): Locale | null {
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const locale = localStorage.getItem(demoLocaleKey);
    return locale === 'en' || locale === 'he' ? locale : null;
  } catch { return null; }
}

export function readPersonalLocale(): Locale {
  try { return localStorage.getItem('locale') === 'en' ? 'en' : 'he'; }
  catch { return 'he'; }
}

export function mirrorDemoEntryLocale(locale: Locale | null) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    if (locale) localStorage.setItem(demoLocaleKey, locale);
    else localStorage.removeItem(demoLocaleKey);
  } catch { /* The shared demo preferences also work without browser storage. */ }
}
