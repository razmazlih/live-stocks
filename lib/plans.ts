import { mapPositionPlanRow } from '@/lib/positions';
import { fetchFinnhubQuote, FinnhubQuoteResult } from '@/lib/services/finnhub';
import { supabase } from '@/lib/supabase';
import { PositionPlan } from '@/types';

export interface ProcessPlansOptions {
  token?: string | null;
}

export interface ProcessPlansResult {
  triggered: PositionPlan[];
  expired: PositionPlan[];
  errors: string[];
}

const MAX_QUOTE_STALENESS_MS = 12 * 60 * 60 * 1000;

function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export async function processPendingPlans(options: ProcessPlansOptions): Promise<ProcessPlansResult> {
  const todayIso = getTodayIsoDate();
  const triggered: PositionPlan[] = [];
  const expired: PositionPlan[] = [];
  const errors: string[] = [];

  const { data: pendingData, error: pendingError } = await supabase
    .from('position_plans')
    .select('*')
    .eq('status', 'pending');

  if (pendingError) {
    throw pendingError;
  }

  const pendingPlans = (pendingData || []).map(mapPositionPlanRow);

  if (!pendingPlans.length) {
    return { triggered, expired, errors };
  }

  const triggerCandidates: PositionPlan[] = [];

  for (const plan of pendingPlans) {
    if (todayIso > plan.targetDate) {
      try {
        const { error: updateError } = await supabase
          .from('position_plans')
          .update({ status: 'expired', expired_at: todayIso })
          .eq('id', plan.id);

        if (updateError) {
          throw updateError;
        }

        expired.push({ ...plan, status: 'expired', expiredAt: todayIso });
      } catch (error) {
        console.error('Failed to expire plan', plan.id, error);
        errors.push(plan.id ?? '');
      }
      continue;
    }

    triggerCandidates.push(plan);
  }

  if (!triggerCandidates.length) {
    return { triggered, expired, errors };
  }

  const uniqueSymbols = Array.from(new Set(triggerCandidates.map((plan) => plan.symbol)));
  const quotes = new Map<string, FinnhubQuoteResult>();

  if (options.token) {
    const quoteResults = await Promise.all(
      uniqueSymbols.map(async (symbol) => {
        const quote = await fetchFinnhubQuote(symbol, { token: options.token });
        return { symbol, quote };
      }),
    );

    for (const { symbol, quote } of quoteResults) {
      if (quote && Number.isFinite(quote.price)) {
        quotes.set(symbol, quote);
      }
    }
  }

  for (const plan of triggerCandidates) {
    try {
      const quote = quotes.get(plan.symbol);
      if (!quote) {
        continue;
      }

      const { price: quotePrice, timestamp } = quote;

      if (!Number.isFinite(quotePrice)) {
        continue;
      }

      if (!timestamp) {
        continue;
      }

      const quoteDate = new Date(timestamp * 1000);
      if (Number.isNaN(quoteDate.getTime())) {
        continue;
      }

      const quoteDateIso = quoteDate.toISOString().split('T')[0];
      if (quoteDateIso < todayIso) {
        continue;
      }

      const quoteAgeMs = Date.now() - quoteDate.getTime();
      if (Number.isFinite(quoteAgeMs) && quoteAgeMs > MAX_QUOTE_STALENESS_MS) {
        continue;
      }

      let positionId = plan.positionId ?? null;

      const shouldTrigger =
        (plan.side === 'buy' && quotePrice <= plan.targetPrice) ||
        (plan.side === 'sell' && quotePrice >= plan.targetPrice);

      if (!shouldTrigger) {
        continue;
      }

      if (!positionId) {
        if (plan.side === 'sell') {
          throw new Error(`Sell plan ${plan.id} is missing a linked position`);
        }

        const fallbackImage = plan.imageUrl || `https://logo.clearbit.com/${plan.symbol.toLowerCase()}.com`;
        const fallbackDisplay = plan.display ?? plan.symbol;

        const { data: newPosition, error: positionError } = await supabase
          .from('positions')
          .insert({
            symbol: plan.symbol,
            display: fallbackDisplay,
            image_url: fallbackImage,
            entry_price: quotePrice,
            quantity: plan.targetQuantity,
            entry_date: todayIso,
          })
          .select()
          .single();

        if (positionError) {
          throw positionError;
        }

        positionId = newPosition.id;
      }

      const { error: lotError } = await supabase.from('position_lots').insert({
        position_id: positionId,
        side: plan.side === 'sell' ? 'SELL' : 'BUY',
        price: quotePrice,
        quantity: plan.targetQuantity,
        executed_at: todayIso,
      });

      if (lotError) {
        throw lotError;
      }

      const { error: planUpdateError } = await supabase
        .from('position_plans')
        .update({
          status: 'triggered',
          triggered_at: todayIso,
          executed_price: quotePrice,
          position_id: positionId,
        })
        .eq('id', plan.id);

      if (planUpdateError) {
        throw planUpdateError;
      }

      triggered.push({
        ...plan,
        positionId,
        status: 'triggered',
        triggeredAt: todayIso,
        executedPrice: quotePrice,
      });
    } catch (error) {
      console.error('Failed to process plan', plan.id, error);
      errors.push(plan.id ?? '');
    }
  }

  return { triggered, expired, errors };
}
