import { mapPositionPlanRow } from '@/lib/positions';
import { fetchFinnhubQuote, FinnhubQuoteResult } from '@/lib/services/finnhub';
import { getSupabaseClient } from '@/lib/supabase';
import { getStockLogoUrl } from '@/lib/stock-logo-sources';
import { PositionLocation, PositionPlan } from '@/types';

export interface ProcessPlansOptions {
  token?: string | null;
  timeZone?: string;
}

export interface ProcessPlansResult {
  triggered: PositionPlan[];
  expired: PositionPlan[];
  errors: string[];
}

function resolveTimeZone(timeZone?: string): string {
  if (timeZone) {
    return timeZone;
  }

  if (process.env.PLAN_PROCESS_TIMEZONE) {
    return process.env.PLAN_PROCESS_TIMEZONE;
  }

  if (process.env.TZ) {
    return process.env.TZ;
  }

  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved || 'UTC';
}

function getTodayIsoDate(timeZone?: string): string {
  const tz = resolveTimeZone(timeZone);
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

async function claimPendingPlan(plan: PositionPlan): Promise<{ claimed: boolean; updatedAt?: string }> {
  if (!plan.id) {
    return { claimed: false };
  }

  const claimTimestamp = new Date().toISOString();
  const supabase = getSupabaseClient();
  let claimQuery = supabase
    .from('position_plans')
    .update({ updated_at: claimTimestamp })
    .eq('id', plan.id)
    .eq('status', 'pending');

  if (plan.updatedAt) {
    claimQuery = claimQuery.eq('updated_at', plan.updatedAt);
  } else {
    claimQuery = claimQuery.is('updated_at', null);
  }

  const { data, error } = await claimQuery.select('id, updated_at').limit(1);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return { claimed: false };
  }

  const updatedAt = data[0]?.updated_at ?? claimTimestamp;
  return { claimed: true, updatedAt };
}

async function releasePlanClaim(planId: string | undefined, previousUpdatedAt?: string): Promise<void> {
  if (!planId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    let q = supabase
      .from('position_plans')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('status', 'pending');

    if (previousUpdatedAt) {
      q = q.eq('updated_at', previousUpdatedAt);
    }

    await q;
  } catch (releaseError) {
    console.error('Failed to release claim for plan', planId, releaseError);
  }
}

async function ensureSufficientSellQuantity(positionId: string, requiredQuantity: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('position_lots')
    .select('side, quantity')
    .eq('position_id', positionId);

  if (error) {
    throw error;
  }

  const availableQuantity = (data || []).reduce((acc, lot) => {
    const rawQuantity = typeof lot.quantity === 'number' ? lot.quantity : Number.parseFloat(String(lot.quantity));
    const quantity = Number.isFinite(rawQuantity) ? rawQuantity : 0;
    if (lot.side === 'BUY') {
      return acc + quantity;
    }
    if (lot.side === 'SELL') {
      return acc - quantity;
    }
    return acc;
  }, 0);

  if (!Number.isFinite(availableQuantity)) {
    throw new Error(`Failed to determine available quantity for position ${positionId}`);
  }

  if (availableQuantity + 1e-6 < requiredQuantity) {
    throw new Error(
      `Insufficient quantity to sell. Required ${requiredQuantity}, available ${Math.max(availableQuantity, 0)}`,
    );
  }
}

// Accept quotes up to 24 hours old so we can trigger plans even if the latest trade was on the previous UTC day.
const MAX_QUOTE_AGE_MS = 24 * 60 * 60 * 1000;

export async function processPendingPlans(options: ProcessPlansOptions): Promise<ProcessPlansResult> {
  const todayIso = getTodayIsoDate(options.timeZone);
  const now = Date.now();
  const triggered: PositionPlan[] = [];
  const expired: PositionPlan[] = [];
  const errors: string[] = [];

  let supabase: ReturnType<typeof getSupabaseClient>;
  try {
    supabase = getSupabaseClient();
  } catch (clientError) {
    console.error('Failed to initialize Supabase client for plan processing:', clientError);
    errors.push('supabase');
    return { triggered, expired, errors };
  }

  const { data: pendingData, error: pendingError } = await supabase
    .from('position_plans')
    .select('*')
    .eq('status', 'pending');

  if (pendingError) {
    console.error('Failed to fetch pending plans:', pendingError);
    errors.push('pending');
    return { triggered, expired, errors };
  }

  const pendingPlans = (pendingData || []).map(mapPositionPlanRow);

  if (!pendingPlans.length) {
    return { triggered, expired, errors };
  }

  const triggerCandidates: PositionPlan[] = [];

  for (const plan of pendingPlans) {
    let expireClaimedUpdatedAt: string | undefined;
    if (todayIso > plan.targetDate) {
      try {
        const { claimed, updatedAt } = await claimPendingPlan(plan);
        expireClaimedUpdatedAt = updatedAt;

        if (!claimed) {
          continue;
        }

        const { error: updateError } = await supabase
          .from('position_plans')
          .update({ status: 'expired', expired_at: todayIso, updated_at: new Date().toISOString() })
          .eq('id', plan.id)
          .eq('status', 'pending')
          .eq('updated_at', updatedAt);

        if (updateError) {
          throw updateError;
        }

        expired.push({ ...plan, status: 'expired', expiredAt: todayIso });
      } catch (error) {
        console.error('Failed to expire plan', plan.id, error);
        errors.push(plan.id ?? '');
        await releasePlanClaim(plan.id, expireClaimedUpdatedAt);
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
    const quoteResults = await Promise.allSettled(
      uniqueSymbols.map(async (symbol) => {
        const quote = await fetchFinnhubQuote(symbol, { token: options.token });
        return { symbol, quote };
      }),
    );

    quoteResults.forEach((result, index) => {
      const symbol = uniqueSymbols[index];
      if (result.status === 'fulfilled') {
        const { quote } = result.value;
        if (quote && Number.isFinite(quote.price)) {
          quotes.set(symbol, quote);
        }
        return;
      }

      console.error('Failed to fetch quote', symbol, result.reason);
      errors.push(`quote:${symbol}`);
    });
  }

  for (const plan of triggerCandidates) {
    const requiredQuantity = plan.targetQuantity;
    let positionId = plan.positionId ?? null;
    let createdPositionId: string | null = null;
    let createdLotId: string | null = null;
    let planClaimed = false;
    let claimedUpdatedAt: string | undefined;
    let planUpdated = false;
    let resolvedLocation: PositionLocation | null = plan.positionId
      ? plan.location ?? null
      : plan.location ?? 'bank_one';

    try {
      const quote = quotes.get(plan.symbol);
      if (!quote) {
        continue;
      }

      const quotePrice = quote.price;
      const quoteTimestamp = quote.timestamp;

      if (!Number.isFinite(quotePrice)) {
        continue;
      }

      if (!quoteTimestamp || !Number.isFinite(quoteTimestamp)) {
        continue;
      }

      const quoteMs = quoteTimestamp * 1000;
      if (!Number.isFinite(quoteMs)) {
        continue;
      }

      const quoteAgeMs = now - quoteMs;

      if (quoteAgeMs > MAX_QUOTE_AGE_MS) {
        continue;
      }

      if (quoteAgeMs < -MAX_QUOTE_AGE_MS) {
        continue;
      }

      const shouldTrigger =
        (plan.side === 'buy' && quotePrice <= plan.targetPrice) ||
        (plan.side === 'sell' && quotePrice >= plan.targetPrice);

      if (!shouldTrigger) {
        continue;
      }

      const claimResult = await claimPendingPlan(plan);

      if (!claimResult.claimed) {
        continue;
      }

      planClaimed = true;
      claimedUpdatedAt = claimResult.updatedAt;

      if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
        throw new Error(`Plan ${plan.id} has invalid target quantity ${plan.targetQuantity}`);
      }

      if (!positionId) {
        if (plan.side === 'sell') {
          throw new Error(`Sell plan ${plan.id} is missing a linked position`);
        }

        const fallbackImage = getStockLogoUrl(plan.symbol, plan.imageUrl);
        const fallbackDisplay = plan.display ?? plan.symbol;
        const locationToUse = resolvedLocation ?? 'bank_one';

        const { data: newPosition, error: positionError } = await supabase
          .from('positions')
          .insert({
            symbol: plan.symbol,
            display: fallbackDisplay,
            image_url: fallbackImage,
            entry_price: quotePrice,
            quantity: requiredQuantity,
            entry_date: todayIso,
            location: locationToUse,
          })
          .select('id')
          .single();

        if (positionError) {
          throw positionError;
        }

        positionId = newPosition.id;
        createdPositionId = positionId;
        resolvedLocation = locationToUse;
      }

      if (!positionId) {
        throw new Error(`Unable to resolve position for plan ${plan.id}`);
      }

      if (plan.side === 'sell') {
        await ensureSufficientSellQuantity(positionId, requiredQuantity);
      }

      const commissionAmount = plan.hasCommission ? Math.max(plan.commissionAmount, 0) : 0;

      const { data: newLot, error: lotError } = await supabase
        .from('position_lots')
        .insert({
          position_id: positionId,
          side: plan.side === 'sell' ? 'SELL' : 'BUY',
          price: quotePrice,
          quantity: requiredQuantity,
          executed_at: todayIso,
          has_commission: plan.hasCommission,
          commission_amount: commissionAmount,
        })
        .select('id')
        .single();

      if (lotError) {
        throw lotError;
      }

      createdLotId = newLot.id ?? null;

      const planUpdateTimestamp = new Date().toISOString();
      const { error: planUpdateError } = await supabase
        .from('position_plans')
        .update({
          status: 'triggered',
          triggered_at: todayIso,
          executed_price: quotePrice,
          position_id: positionId,
          updated_at: planUpdateTimestamp,
        })
        .eq('id', plan.id)
        .eq('status', 'pending')
        .eq('updated_at', claimedUpdatedAt);

      if (planUpdateError) {
        throw planUpdateError;
      }

      planUpdated = true;

      triggered.push({
        ...plan,
        positionId,
        status: 'triggered',
        triggeredAt: todayIso,
        executedPrice: quotePrice,
        location: resolvedLocation,
      });
    } catch (error) {
      console.error('Failed to process plan', plan.id, error);
      errors.push(plan.id ?? '');

      if (createdLotId) {
        try {
          await supabase.from('position_lots').delete().eq('id', createdLotId);
        } catch (lotCleanupError) {
          console.error('Failed to rollback lot', createdLotId, lotCleanupError);
        }
      }

      if (createdPositionId) {
        try {
          await supabase.from('positions').delete().eq('id', createdPositionId);
        } catch (positionCleanupError) {
          console.error('Failed to rollback position', createdPositionId, positionCleanupError);
        }
      }

      if (planClaimed && !planUpdated) {
        await releasePlanClaim(plan.id, claimedUpdatedAt);
      }
    }
  }

  return { triggered, expired, errors };
}
