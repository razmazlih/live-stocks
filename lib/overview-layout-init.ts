import { diskMarketModeKey, reviewMarketModeKey } from './demo/market-scenarios';
import { demoLocaleKey } from './entry-locale';
import { tradingCalendarRange, tradingSession } from './utils/trading-hours';

const dayMs = 86_400_000;
const firstDay = Date.parse(tradingCalendarRange.start);
const lastDay = Date.parse(tradingCalendarRange.end);

// Compute once per server module. Each exchange date is one character, indexing its
// actual UTC boundaries (including holidays, shortened days and daylight saving).
const windows = ['[]'];
let schedule = '';
for (let day = firstDay; day <= lastDay; day += dayMs) {
  const session = tradingSession(new Date(day).toISOString().slice(0, 10));
  const bounds = session ? [session.pre, session.open, session.close, session.postEnd].map(time => (time - day) / 60_000) : [];
  const key = JSON.stringify(bounds);
  if (!windows.includes(key)) windows.push(key);
  schedule += windows.indexOf(key);
}

/** Shapes the static entry skeleton before paint, without reading an account or changing the valuation clock. */
export function overviewLayoutInitScript(development: boolean, review: boolean) {
  const demoHint = development || review ? `
    const loopback = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    const local = ${development} && loopback;
    const review = ${review} && (${!development} || loopback);
    let remembered = false, stored;
    try {
      remembered = local && ['en','he'].includes(localStorage.getItem('${demoLocaleKey}'));
      if (review) {
        const linked = new URLSearchParams(location.search).get('scenario');
        const saved = sessionStorage.getItem('${reviewMarketModeKey}');
        stored = ['regular','extended','closed'].includes(linked) ? linked : local && saved === 'realtime' ? saved
          : ['regular','extended','closed'].includes(saved) ? saved : 'regular';
      }
      else if (remembered) stored = sessionStorage.getItem('${diskMarketModeKey}');
    } catch {}
    if (local && (review || remembered)) root.dataset.localMarketFooter = 'true';
    if (['regular','extended','closed'].includes(stored)) {
      root.dataset.initialDemoMarketLayout = stored;
      phase = stored;
    }` : '';
  return `(()=>{if(location.pathname!=='/')return;
    const root=document.documentElement, now=Date.now(), first=${firstDay}, days='${schedule}', windows=[${windows.join(',')}];
    const index=Math.floor((now-first)/86400000);
    let phase=index<0||index>=days.length?'unknown':'closed';
    for(const day of [index-1,index]){
      const bounds=windows[days[day]];
      if(!bounds?.length)continue;
      const minute=(now-first-day*86400000)/60000;
      if(minute>=bounds[0]&&minute<bounds[3])phase=minute>=bounds[1]&&minute<bounds[2]?'regular':'extended';
    }
    ${demoHint}
    root.dataset.loadingMarketPhase=phase;
  })();`;
}

export const initialOverviewLayout = overviewLayoutInitScript(process.env.NODE_ENV === 'development',
  process.env.LIVESTOCKS_REVIEW_DEMO === '1' && (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'));
