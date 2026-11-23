'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import { useInvestmentSources } from '@/hooks/use-investment-sources';
import { Button } from '@/components/ui/button';
import { createDefaultTransactionForm, TransactionComposer } from './transaction-composer';
import type { Position } from '@/types';

export function InspectorTrade({ positions, asset, source, initialSide, quote, onSaved, onSavingChange, onExpand }: {
  positions: Position[];
  asset: { symbol: string; display: string; imageUrl?: string | null };
  source?: string; initialSide?: 'BUY' | 'SELL'; quote?: number;
  onSaved(): void; onSavingChange(saving: boolean): void; onExpand(): void;
}) {
  const { locale } = useApp();
  const he = locale === 'he';
  const { sources, activeSources, loading, error, sourceName } = useInvestmentSources();
  const [side, setSide] = useState(initialSide);
  const [chosen, setChosen] = useState(source ?? '');
  const [saving, setSaving] = useState(false);
  const sourceIds = [...new Set([...positions.map(position => position.location), ...activeSources.map(item => item.id)])];
  const inferred = positions.length === 1 ? positions[0].location : sourceIds.length === 1 ? sourceIds[0] : '';
  const selected = chosen || inferred;
  const target = positions.find(position => position.location === selected);
  const valid = !loading && !error && sources.some(item => item.id === selected && (!item.archivedAt || target));
  const purchaseTarget = valid && selected ? { ...asset, imageUrl: asset.imageUrl ?? '', location: selected,
    quantity: 0, entryPrice: 0, entryDate: '' } : null;
  const onStart = (next: 'BUY' | 'SELL') => { setSide(next); onExpand(); };
  if (!side) return <div className="flex gap-2">
    <Button className="min-h-11 flex-1" onClick={() => onStart('BUY')}>{he ? 'רישום קנייה' : 'Record purchase'}</Button>
    <Button variant="outline" className="min-h-11 flex-1" disabled={!positions.some(position => position.quantity > 0)} onClick={() => onStart('SELL')}>{he ? 'רישום מכירה' : 'Record sale'}</Button>
  </div>;
  return <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={he ? 'רישום עסקה' : 'Record trade'}>
    <div className="px-5 pt-5">
      <label className="flex flex-col gap-2 text-sm font-medium">{he ? 'מקור השקעה' : 'Investment source'}
        <select disabled={saving || loading || Boolean(error)} value={selected} onChange={event => setChosen(event.target.value)}
          className="min-h-11 rounded-lg border border-input bg-background px-3">
          <option value="" disabled>{he ? 'בחירת מקור השקעה' : 'Choose investment source'}</option>
          {sourceIds.map(id => <option value={id} key={id}>{sourceName(id, locale)}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mt-2 text-sm">{he ? 'לא ניתן לטעון את מקורות ההשקעה.' : 'Investment sources could not be loaded.'}</p>}
    </div>
    <TransactionComposer target={valid ? target ?? purchaseTarget : null} initial={createDefaultTransactionForm(side)} currentQuote={quote}
      onCancel={() => setSide(undefined)} onSavingChange={value => { setSaving(value); onSavingChange(value); }}
      onSaved={() => { setSide(undefined); onSaved(); }} />
  </section>;
}
