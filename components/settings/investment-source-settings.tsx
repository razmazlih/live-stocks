'use client';

import { useState, type FormEvent } from 'react';
import { useInvestmentSources } from '@/hooks/use-investment-sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InvestmentSource } from '@/types';

function SourceRow({ source, locale }: { source: InvestmentSource; locale: 'he' | 'en' }) {
  const { renameSource, archiveSource, restoreSource } = useInvestmentSources();
  const he = locale === 'he';
  const [name, setName] = useState(source.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(false);
    try { await action(); } catch { setError(true); } finally { setBusy(false); }
  }
  return <li className="space-y-2 rounded-xl border border-slate-200 p-3">
    <form onSubmit={event => { event.preventDefault(); void run(() => renameSource(source.id, name)); }} className="flex flex-wrap items-center gap-2">
      <Input aria-label={he ? 'שם מקור ההשקעה' : 'Investment source name'} value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy} className="min-w-0 flex-1 basis-40" />
      <Button type="submit" variant="outline" disabled={busy || name.trim() === source.name}>{he ? 'שמירת שם' : 'Save name'}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(() => source.archivedAt ? restoreSource(source.id) : archiveSource(source.id))}>{source.archivedAt ? he ? 'שחזור' : 'Restore' : he ? 'ארכוב' : 'Archive'}</Button>
      {source.archivedAt ? <span className="text-xs text-slate-500">{he ? 'בארכיון' : 'Archived'}</span> : null}
    </form>
    {error ? <p role="alert" className="text-sm text-red-700">{he ? 'השינוי לא נשמר. השם חייב להיות ייחודי; לארכוב נדרש מקור פעיל נוסף וללא החזקות פעילות או הוראות ממתינות.' : 'Change failed. Names must be unique. Archiving requires another active source and no open holdings or pending orders.'}</p> : null}
  </li>;
}

export function InvestmentSourceSettings({ locale }: { locale: 'he' | 'en' }) {
  const { sources, loading, error, refresh, createSource } = useInvestmentSources();
  const he = locale === 'he';
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setSaveError(false);
    try { await createSource(name); setName(''); } catch { setSaveError(true); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="investment-sources-title">
    <div><h2 id="investment-sources-title" className="font-semibold text-slate-950">{he ? 'מקורות השקעה' : 'Investment sources'}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{he ? 'בנק, בית השקעות או כל מקור אחר שבו מוחזקות המניות שלך. ארכוב שומר את כל ההיסטוריה.' : 'Banks, brokers, or any other place you hold investments. Archiving preserves all history.'}</p></div>
    {loading ? <p role="status">{he ? 'טוען מקורות…' : 'Loading sources…'}</p> : null}
    {error ? <div role="alert"><p>{he ? 'טעינת המקורות נכשלה' : 'Unable to load sources'}</p><Button type="button" variant="outline" onClick={() => void refresh()}>{he ? 'ניסיון נוסף' : 'Retry'}</Button></div> : null}
    <ul className="space-y-3">{sources.map(source => <SourceRow key={source.id} source={source} locale={locale} />)}</ul>
    <form onSubmit={add} className="flex flex-wrap gap-2"><Input aria-label={he ? 'שם מקור חדש' : 'New source name'} placeholder={he ? 'למשל: בית ההשקעות שלי' : 'For example: My brokerage'} value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy || loading || Boolean(error)} className="min-w-0 flex-1 basis-48" /><Button type="submit" disabled={busy || loading || Boolean(error) || !name.trim()}>{he ? 'הוספת מקור' : 'Add source'}</Button></form>
    {saveError ? <p role="alert" className="text-sm text-red-700">{he ? 'המקור לא נוסף. יש לבחור שם ייחודי באורך של עד 80 תווים.' : 'Unable to add source. Choose a unique name of up to 80 characters.'}</p> : null}
  </section>;
}
