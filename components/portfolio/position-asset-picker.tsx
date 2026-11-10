'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import type { Locale } from '@/types';

export interface PositionAssetValue {
  symbol: string;
  display: string;
  imageUrl: string;
}

interface PositionAssetPickerProps {
  locale: Locale;
  value: PositionAssetValue;
  knownAssets: PositionAssetValue[];
  onChange: (asset: PositionAssetValue) => void;
}

export function PositionAssetPicker({ locale, value, knownAssets, onChange }: PositionAssetPickerProps) {
  const he = locale === 'he';
  const id = useId();
  const [results, setResults] = useState<PositionAssetValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const manuallyEdited = useRef(false);
  const latestValue = useRef(value);
  const onChangeRef = useRef(onChange);
  latestValue.current = value;
  onChangeRef.current = onChange;
  const symbol = value.symbol.trim().toUpperCase();
  const selected = Boolean(value.display.trim());
  const known = useMemo(() => [...new Map(knownAssets.map(({ symbol, display, imageUrl }) => [symbol.toUpperCase(), { symbol, display, imageUrl }])).values()], [knownAssets]);
  const localMatches = useMemo(() => symbol ? known.filter(asset => `${asset.symbol} ${asset.display}`.toUpperCase().includes(symbol)) : known.slice(0, 5), [known, symbol]);
  const suggestions = useMemo(() => [...new Map([...localMatches, ...results].map(asset => [asset.symbol.toUpperCase(), asset])).values()].slice(0, 6), [localMatches, results]);
  const showSuggestions = focused && !selected && suggestions.length > 0;

  useEffect(() => {
    setResults([]);
    setLookupError(false);
    setActiveIndex(-1);
    if (!symbol || selected) { setLoading(false); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/assets?q=${encodeURIComponent(symbol)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Lookup unavailable');
        const data = await response.json() as { results: PositionAssetValue[] };
        if (!controller.signal.aborted && latestValue.current.symbol.trim().toUpperCase() === symbol) {
          setResults(data.results);
          const exact = data.results.find(asset => asset.symbol === symbol);
          if (exact && !latestValue.current.display) onChangeRef.current(exact);
        }
      } catch {
        if (!controller.signal.aborted) setLookupError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [symbol, selected]);

  // Enrich remote selections with the provider's company name and logo. Never overwrite a later edit.
  useEffect(() => {
    if (manuallyEdited.current || !symbol || !selected || value.imageUrl || known.some(asset => asset.symbol.toUpperCase() === symbol)) return;
    const controller = new AbortController();
    const currentDisplay = value.display;
    void (async () => {
      try {
        const response = await fetch(`/api/assets?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal });
        if (!response.ok) return;
        const asset = await response.json() as PositionAssetValue;
        if (!controller.signal.aborted && latestValue.current.symbol.trim().toUpperCase() === symbol && latestValue.current.display === currentDisplay) onChangeRef.current(asset);
      } catch { /* Search results remain usable when profile lookup is unavailable. */ }
    })();
    return () => controller.abort();
  }, [symbol, selected, value.imageUrl, value.display, known]);

  function choose(asset: PositionAssetValue) {
    manuallyEdited.current = false;
    onChange(asset);
    setFocused(false);
    setActiveIndex(-1);
  }

  return <div className="space-y-3">
    <div>
      <Label htmlFor="symbol">{he ? 'סימול' : 'Symbol'}</Label>
      <div className="relative mt-1.5">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input id="symbol" value={value.symbol} placeholder={he ? 'למשל AAPL או שם חברה' : 'e.g. AAPL or company name'} required autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={showSuggestions ? `${id}-results` : undefined} aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} aria-describedby={`${id}-help`} className="ps-10 pe-10" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => {
          manuallyEdited.current = false;
          const next = event.target.value.toUpperCase();
          const match = known.find(asset => asset.symbol.toUpperCase() === next.trim());
          onChange(match ? { ...match, symbol: next.trim() } : { symbol: next, display: '', imageUrl: '' });
          setFocused(true);
        }} onKeyDown={event => {
          if (event.key === 'Escape') { setFocused(false); return; }
          if (!showSuggestions) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(previous => event.key === 'ArrowDown' ? (previous + 1) % suggestions.length : (previous <= 0 ? suggestions.length - 1 : previous - 1));
          }
          if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); choose(suggestions[activeIndex]); }
        }} />
        {loading ? <Loader2 aria-hidden="true" className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" /> : selected ? <Check aria-hidden="true" className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" /> : null}
      </div>
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-slate-500">{he ? 'מקלידים סימול או בוחרים מניה — שם החברה והלוגו מתמלאים אוטומטית.' : 'Enter a symbol or select a stock. Company name and logo fill automatically.'}</p>
    </div>
    {showSuggestions ? <div id={`${id}-results`} role="listbox" aria-label={he ? 'תוצאות חיפוש מניות' : 'Stock search results'} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{suggestions.map((asset, index) => <div key={asset.symbol} id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()} onClick={() => choose(asset)} className={`flex cursor-pointer items-center gap-3 px-3 py-3 text-start transition-colors hover:bg-blue-50 ${index === activeIndex ? 'bg-blue-50' : ''}`}>
      <span dir="ltr" className="min-w-16 text-sm font-semibold text-slate-950">{asset.symbol}</span><span className="min-w-0 truncate text-sm text-slate-500"><bdi>{asset.display}</bdi></span>
    </div>)}</div> : null}
    {selected ? <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <Avatar className="h-11 w-11 shrink-0 rounded-xl border border-white bg-white"><StockAvatarImage symbol={symbol} display={value.display} imageUrl={value.imageUrl} plain /><AvatarFallback className="rounded-xl text-xs font-semibold">{symbol.slice(0, 3)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-950"><bdi>{symbol}</bdi></p><p className="truncate text-sm text-slate-500"><bdi>{value.display}</bdi></p></div>
      <span className="shrink-0 text-xs font-medium text-blue-700">{he ? 'פרטי הנכס מוכנים' : 'Asset details ready'}</span>
    </div> : null}
    <p role="status" className="text-xs text-slate-500">{lookupError ? (he ? 'החיפוש אינו זמין כרגע. אפשר לבחור נכס קיים או להזין פרטים ידנית.' : 'Search is unavailable. Choose an existing asset or enter details manually.') : loading ? (he ? 'מחפש מניות…' : 'Searching stocks…') : ''}</p>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700"><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{he ? 'עריכת פרטים ידנית' : 'Edit details manually'}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`${id}-display`}>{he ? 'שם תצוגה' : 'Display name'}</Label><Input id={`${id}-display`} value={value.display} onChange={event => { manuallyEdited.current = true; onChange({ ...value, display: event.target.value }); }} /></div><div><Label htmlFor={`${id}-logo`}>{he ? 'כתובת לוגו' : 'Logo URL'}</Label><Input id={`${id}-logo`} dir="ltr" value={value.imageUrl} onChange={event => { manuallyEdited.current = true; onChange({ ...value, imageUrl: event.target.value }); }} placeholder="https://…" /></div></div>
    </details>
  </div>;
}
