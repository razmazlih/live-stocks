import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapPositionRow } from '@/lib/positions';
import { calculateWeightedPortfolioPrice } from '@/lib/calculations';
import { fetchUsdToIlsRate } from '@/lib/exchange';
import { Position } from '@/types';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFixed(value: number, digits = 2): number {
  return Number.parseFloat(value.toFixed(digits));
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('positions')
      .select('*, position_lots(*)')
      .order('symbol');

    if (error) {
      console.error('Failed to load positions for weighted price:', error);
      return NextResponse.json(
        { error: 'Failed to load positions' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const rawPositions = Array.isArray(data) ? data : [];
    const positions: Position[] = rawPositions
      .map(mapPositionRow)
      .filter(position => isFiniteNumber(position.quantity) && position.quantity > 0);

    const usdToIlsRatePromise = fetchUsdToIlsRate();
    const weightedPriceUsd = calculateWeightedPortfolioPrice(positions);
    const usdToIlsRate = await usdToIlsRatePromise;

    if (!isFiniteNumber(weightedPriceUsd)) {
      return NextResponse.json(
        {
          timestamp: new Date().toISOString(),
          usdToIlsRate,
          weightedPrice: null,
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        usdToIlsRate,
        weightedPrice: {
          usd: toFixed(weightedPriceUsd),
          ils: toFixed(weightedPriceUsd * usdToIlsRate),
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Weighted price API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate weighted price' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
