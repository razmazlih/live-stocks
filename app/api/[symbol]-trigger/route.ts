import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { PositionTriggerAlert, TriggerItem } from '@/types';

function extractSymbolFromSlug(slug: string | string[] | undefined): string | null {
  if (!slug) {
    return null;
  }

  const value = Array.isArray(slug) ? slug[0] : slug;

  if (!value?.endsWith('-trigger')) {
    return null;
  }

  const symbol = value.slice(0, -'-trigger'.length).trim();
  if (!symbol) {
    return null;
  }

  return symbol.toUpperCase();
}

function normalizeItems(items: unknown): TriggerItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized: TriggerItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const { name, condition, status, hint } = item as Record<string, unknown>;
    if (typeof name !== 'string' || typeof condition !== 'string' || typeof status !== 'string') {
      continue;
    }

    normalized.push({
      name,
      condition,
      status,
      hint: typeof hint === 'string' ? hint : undefined,
    });
  }

  return normalized;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = extractSymbolFromSlug(params.symbol);
  if (!symbol) {
    return NextResponse.json({ error: 'Invalid trigger endpoint' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('position_triggers')
    .select('symbol, ts, items')
    .eq('symbol', symbol)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load triggers:', error.message);
    return NextResponse.json({ error: 'Failed to load triggers' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ symbol, alert: null });
  }

  const items = normalizeItems(data.items);

  const alert: PositionTriggerAlert = {
    symbol: data.symbol,
    ts: data.ts,
    items,
  };

  return NextResponse.json({ symbol, alert });
}

export async function POST(request: NextRequest, { params }: { params: { symbol: string } }) {
  const symbol = extractSymbolFromSlug(params.symbol);
  if (!symbol) {
    return NextResponse.json({ error: 'Invalid trigger endpoint' }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { symbol?: string; ts?: string; items?: unknown }
    | null;

  if (!payload) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (payload.symbol && payload.symbol.toUpperCase() !== symbol) {
    return NextResponse.json({ error: 'Symbol mismatch' }, { status: 400 });
  }

  const items = normalizeItems(payload.items);

  if (items.length === 0) {
    return NextResponse.json({ error: 'At least one trigger item is required' }, { status: 400 });
  }

  const timestamp = (() => {
    if (payload.ts) {
      const parsed = new Date(payload.ts);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  })();

  const { error } = await supabase.from('position_triggers').insert({
    symbol,
    ts: timestamp,
    items,
  });

  if (error) {
    console.error('Failed to store trigger alert:', error.message);
    return NextResponse.json({ error: 'Failed to store trigger alert' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
