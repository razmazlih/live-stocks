import {
  Position,
  PositionLocation,
  PositionLot,
  PositionLotType,
  PositionPlan,
  RealizedSale,
} from '@/types';

export const DEFAULT_COMMISSION_USD = 8;
export type FxRateResolver = (timestamp: number) => number;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

interface SupabasePositionLot {
  id: string;
  position_id: string;
  side: PositionLotType;
  basis_acquired_on?: string | null;
  basis_date_estimate?: string | null;
  created_at?: string;
  price: number | string;
  quantity: number | string;
  executed_at: string;
  has_commission: boolean | null;
  commission_amount: number | string | null;
}

interface SupabasePositionPlan {
  id: string;
  position_id: string | null;
  symbol: string;
  display: string | null;
  image_url: string | null;
  side: 'buy' | 'sell' | null;
  target_price: number | string;
  target_quantity: number | string;
  target_date: string;
  has_commission: boolean | null;
  commission_amount: number | string | null;
  status: PositionPlan['status'];
  triggered_at: string | null;
  expired_at: string | null;
  executed_price: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  location: string | null;
}

interface SupabasePositionRow {
  id: string;
  symbol: string;
  display: string;
  image_url: string;
  entry_price?: number | string | null;
  quantity?: number | string | null;
  entry_date?: string | null;
  position_lots?: SupabasePositionLot[] | null;
  position_plans?: SupabasePositionPlan[] | null;
  location?: string | null;
}

export interface OpenLot {
  id?: string;
  price: number;
  quantity: number;
  executedAt: string;
  totalCost: number;
  basisDateKnown?: boolean;
}

export interface PositionSummary {
  openLots: OpenLot[];
  totalQuantity: number;
  costBasis: number;
  averageEntryPrice: number;
  earliestEntryDate?: string;
  weightedHoldingYears: number;
}

function parseNumeric(value?: number | string | null): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLot(lot: SupabasePositionLot): PositionLot {
  const hasCommission = lot.has_commission !== false;
  const rawCommission = parseNumeric(lot.commission_amount);
  const commissionAmount = hasCommission ? Math.max(rawCommission, 0) : 0;
  return {
    id: lot.id,
    positionId: lot.position_id,
    type: lot.side,
    basisAcquiredOn: lot.basis_acquired_on,
    basisDateEstimate: lot.basis_date_estimate,
    createdAt: lot.created_at,
    price: parseNumeric(lot.price),
    quantity: parseNumeric(lot.quantity),
    executedAt: lot.executed_at,
    hasCommission,
    commissionAmount,
  };
}

function normalizePositionLocation(value: unknown): PositionLocation {
  return value === 'bank_two' ? 'bank_two' : 'bank_one';
}

function normalizePlanLocation(value: unknown): PositionLocation | null {
  if (value === 'bank_one' || value === 'bank_two') {
    return value;
  }
  return null;
}

export function mapPositionPlanRow(plan: SupabasePositionPlan): PositionPlan {
  const executedPrice = plan.executed_price;
  const hasCommission = plan.has_commission !== false;
  const rawCommission = parseNumeric(plan.commission_amount);
  const commissionAmount = hasCommission ? Math.max(rawCommission, 0) : 0;

  return {
    id: plan.id,
    positionId: plan.position_id,
    symbol: plan.symbol,
    display: plan.display,
    imageUrl: plan.image_url,
    side: plan.side === 'sell' ? 'sell' : 'buy',
    targetPrice: parseNumeric(plan.target_price),
    targetQuantity: parseNumeric(plan.target_quantity),
    targetDate: plan.target_date,
    hasCommission,
    commissionAmount,
    status: plan.status,
    triggeredAt: plan.triggered_at,
    expiredAt: plan.expired_at,
    executedPrice: executedPrice == null ? null : parseNumeric(executedPrice),
    createdAt: plan.created_at ?? undefined,
    updatedAt: plan.updated_at ?? undefined,
    location: normalizePlanLocation(plan.location),
  };
}

/** Fees are cash flows on the execution date, including buys that remain open. */
export function calculateCommissionTotals(
  lots: PositionLot[],
  getFxRateAt: FxRateResolver,
  asOf = Date.now(),
): { commissionUsd: number; commissionIls: number } {
  return lots.reduce((totals, lot) => {
    const timestamp = Date.parse(lot.executedAt);
    if (lot.type === 'RECONCILE' || !Number.isFinite(timestamp) || timestamp > asOf || !(lot.quantity > 0) || !lot.hasCommission) return totals;
    const commission = Number.isFinite(lot.commissionAmount) ? Math.max(lot.commissionAmount, 0) : 0;
    if (commission === 0) return totals;
    totals.commissionUsd += commission;
    totals.commissionIls += commission * getFxRateAt(timestamp);
    return totals;
  }, { commissionUsd: 0, commissionIls: 0 });
}

/** Preserve legacy FIFO before reconciliation; afterward use recorded insertion order. */
export function orderPositionLots(lots: PositionLot[]): PositionLot[] {
  const recordedTime = (lot: PositionLot) => {
    const timestamp = lot.createdAt ? Date.parse(lot.createdAt) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : lot.type === 'RECONCILE' ? Infinity : 0;
  };
  const checkpoints = new Map<string, PositionLot[]>();
  for (const lot of lots) {
    if (lot.type !== 'RECONCILE') continue;
    const day = lot.executedAt.slice(0, 10);
    checkpoints.set(day, [...(checkpoints.get(day) ?? []), lot]);
  }
  for (const entries of checkpoints.values()) entries.sort((a, b) => {
    const left = recordedTime(a), right = recordedTime(b);
    return left === right ? 0 : left < right ? -1 : 1;
  });
  const firstCheckpointDay = [...checkpoints.keys()].sort()[0];
  const bucket = (lot: PositionLot) => {
    const entries = checkpoints.get(lot.executedAt.slice(0, 10)) ?? [];
    if (lot.type === 'RECONCILE') return entries.indexOf(lot) * 2 + 1;
    // Legacy trades remain stable within each side of an observation. A later
    // real trade must follow its checkpoint even if the input array is shuffled.
    return entries.filter(entry => recordedTime(entry) < recordedTime(lot)).length * 2;
  };
  return [...lots].sort((a, b) => {
    const dateDelta = Date.parse(a.executedAt) - Date.parse(b.executedAt);
    if (Number.isFinite(dateDelta) && dateDelta !== 0) return dateDelta;
    const aBucket = bucket(a), bBucket = bucket(b);
    if (aBucket !== bBucket) return aBucket - bBucket;
    const afterCheckpoint = firstCheckpointDay !== undefined && (a.executedAt.slice(0, 10) > firstCheckpointDay || aBucket > 0);
    if (afterCheckpoint && a.createdAt && b.createdAt) {
      const creationDelta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (Number.isFinite(creationDelta) && creationDelta !== 0) return creationDelta;
    }
    return 0;
  });
}
export function hasReconciliation(position: Position): boolean {
  return position.accountingIncomplete === true || (position.lots ?? []).some(lot => lot.type === 'RECONCILE');
}

export function computeOpenLots(lots: PositionLot[]): OpenLot[] {
  if (!lots.length) {
    return [];
  }

  const sorted = orderPositionLots(lots);

  const queue: OpenLot[] = [];

  for (const lot of sorted) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
    if (lot.type === 'RECONCILE') {
      queue.length = 0;
      if (quantity > 0) queue.push({ id: lot.id, price: lot.price, quantity, executedAt: lot.basisAcquiredOn ?? '', totalCost: quantity * lot.price, basisDateKnown: Boolean(lot.basisAcquiredOn) });
      continue;
    }
    if (quantity === 0) {
      continue;
    }

    if (lot.type === 'BUY') {
      const commission = lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0;
      const totalCost = quantity * lot.price + commission;
      queue.push({
        id: lot.id,
        price: lot.price,
        quantity,
        executedAt: lot.executedAt,
        totalCost,
      });
      continue;
    }

    let remaining = quantity;
    while (remaining > 0 && queue.length) {
      const current = queue[0];
      if (current.quantity <= 0) {
        queue.shift();
        continue;
      }

      const availableQuantity = current.quantity;
      if (current.quantity > remaining) {
        const costPerUnit = availableQuantity > 0 ? current.totalCost / availableQuantity : current.price;
        const matched = remaining;
        const costPortion = costPerUnit * matched;
        current.quantity = availableQuantity - matched;
        current.totalCost = Math.max(current.totalCost - costPortion, 0);
        remaining = 0;
      } else {
        const matched = availableQuantity;
        const costPerUnit = availableQuantity > 0 ? current.totalCost / availableQuantity : current.price;
        const costPortion = costPerUnit * matched;
        remaining -= matched;
        current.quantity = 0;
        current.totalCost = Math.max(current.totalCost - costPortion, 0);
        queue.shift();
      }
    }
  }

  return queue.filter((lot) => lot.quantity > 1e-8);
}

export function summarizeLots(lots: PositionLot[], asOf: Date = new Date()): PositionSummary {
  const openLots = computeOpenLots(lots);

  if (!openLots.length) {
    return {
      openLots: [],
      totalQuantity: 0,
      costBasis: 0,
      averageEntryPrice: 0,
      weightedHoldingYears: 0,
    };
  }

  const totalQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const costBasis = openLots.reduce((sum, lot) => sum + lot.totalCost, 0);
  const averageEntryPrice = totalQuantity > 0 ? costBasis / totalQuantity : 0;

  const earliestEntryDate = openLots.reduce<string | undefined>((earliest, lot) => {
    if (!lot.executedAt) {
      return earliest;
    }

    if (!earliest) {
      return lot.executedAt;
    }

    return new Date(lot.executedAt) < new Date(earliest) ? lot.executedAt : earliest;
  }, undefined);

  const weightedHoldingYears = totalQuantity > 0
    ? openLots.reduce((acc, lot) => {
        const executedAt = new Date(lot.executedAt);
        if (Number.isNaN(executedAt.getTime())) {
          return Number.NaN;
        }
        const heldYears = Math.max((asOf.getTime() - executedAt.getTime()) / MS_PER_YEAR, 0);
        return acc + heldYears * lot.quantity;
      }, 0) / totalQuantity
    : 0;

  return {
    openLots,
    totalQuantity,
    costBasis,
    averageEntryPrice,
    earliestEntryDate,
    weightedHoldingYears,
  };
}

type ActivationSegment = {
  lots: PositionLot[];
  startTimestamp: number | null;
  endTimestamp: number | null;
  remainingQuantity: number;
};

function normalizeLotTimestamp(lot: PositionLot): number | null {
  if (!lot.executedAt) {
    return null;
  }

  const timestamp = new Date(lot.executedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function collectActivationSegments(position: Position): ActivationSegment[] {
  const lots = Array.isArray(position.lots) ? position.lots : [];

  if (!lots.length) {
    return [];
  }

  const orderedLots = orderPositionLots(lots)
    .map((lot) => ({ lot, timestamp: normalizeLotTimestamp(lot) }))
    .filter((entry): entry is { lot: PositionLot; timestamp: number } => entry.timestamp !== null);

  const segments: ActivationSegment[] = [];
  let currentLots: PositionLot[] = [];
  let currentStart: number | null = null;
  let runningQuantity = 0;

  for (const { lot, timestamp } of orderedLots) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
    if (lot.type === 'RECONCILE') {
      if (!currentLots.length && quantity > 0) currentStart = timestamp;
      currentLots.push(lot);
      runningQuantity = quantity;
      if (quantity <= 1e-8) {
        segments.push({ lots: [...currentLots], startTimestamp: currentStart, endTimestamp: timestamp, remainingQuantity: 0 });
        currentLots = []; currentStart = null;
      }
      continue;
    }
    if (quantity === 0) {
      continue;
    }

    const isBuy = lot.type === 'BUY';

    if (isBuy && runningQuantity <= 0) {
      currentLots = [];
      currentStart = timestamp;
      runningQuantity = 0;
    } else if (!isBuy && runningQuantity <= 0 && currentLots.length === 0) {
      // Ignore unmatched sell lots that precede any open quantity
      continue;
    }

    currentLots.push(lot);
    runningQuantity += isBuy ? quantity : -quantity;

    if (runningQuantity < 0) {
      runningQuantity = 0;
    }

    if (runningQuantity <= 1e-8) {
      segments.push({
        lots: [...currentLots],
        startTimestamp: currentStart,
        endTimestamp: timestamp,
        remainingQuantity: 0,
      });
      currentLots = [];
      currentStart = null;
      runningQuantity = 0;
    }
  }

  if (currentLots.length > 0 || runningQuantity > 0) {
    segments.push({
      lots: [...currentLots],
      startTimestamp: currentStart,
      endTimestamp: null,
      remainingQuantity: runningQuantity,
    });
  }

  return segments;
}

function computeAverageBuyPrice(lots: PositionLot[]): { average: number; earliestBuy?: string | null } {
  const buyLots = lots.filter((lot) => lot.type === 'BUY');

  if (!buyLots.length) {
    return { average: 0, earliestBuy: null };
  }

  const totals = buyLots.reduce(
    (acc, lot) => {
      const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
      if (quantity === 0) {
        return acc;
      }

      const commission = lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0;
      const cost = quantity * lot.price + commission;

      acc.quantity += quantity;
      acc.cost += cost;

      if (!acc.earliest || new Date(lot.executedAt) < new Date(acc.earliest)) {
        acc.earliest = lot.executedAt;
      }

      return acc;
    },
    { quantity: 0, cost: 0, earliest: null as string | null }
  );

  const average = totals.quantity > 0 ? totals.cost / totals.quantity : 0;
  return { average, earliestBuy: totals.earliest };
}

export function expandPositionActivations(position: Position): Position[] {
  const segments = collectActivationSegments(position);
  const baseId = position.id ?? position.symbol;

  if (segments.length === 0) {
    const activationId = `${baseId}::activation-0`;
    const isHistorical = position.quantity <= 0;
    return [
      {
        ...position,
        activationId,
        activationIndex: 0,
        activationStart: position.entryDate ?? null,
        activationEnd: isHistorical ? position.entryDate ?? null : null,
        isHistoricalActivation: isHistorical,
        originalId: position.id,
      },
    ];
  }

  return segments.map((segment, index) => {
    const activationId = `${baseId}::activation-${index + 1}`;
    const { average: averageBuyPrice, earliestBuy } = computeAverageBuyPrice(segment.lots);
    const checkpointSummary = segment.lots.some(lot => lot.type === 'RECONCILE') ? summarizeLots(segment.lots) : null;
    const derivedEntryPrice = checkpointSummary && checkpointSummary.totalQuantity > 0 ? checkpointSummary.averageEntryPrice : averageBuyPrice > 0 ? averageBuyPrice : position.entryPrice;
    const startIso = earliestBuy
      ? new Date(earliestBuy).toISOString()
      : segment.startTimestamp
        ? new Date(segment.startTimestamp).toISOString()
        : position.entryDate ?? null;
    const endIso = segment.endTimestamp ? new Date(segment.endTimestamp).toISOString() : null;
    const remainingQuantity = segment.remainingQuantity > 0 ? segment.remainingQuantity : 0;
    const isHistorical = remainingQuantity <= 0 && endIso !== null;

    const derivedId = !isHistorical && position.id ? position.id : `${activationId}`;

    return {
      ...position,
      id: derivedId,
      originalId: position.id,
      activationId,
      activationIndex: index,
      activationStart: startIso,
      activationEnd: endIso,
      isHistoricalActivation: isHistorical,
      entryPrice: derivedEntryPrice,
      entryDate: startIso ?? position.entryDate,
      quantity: remainingQuantity,
      lots: segment.lots,
      accountingIncomplete: hasReconciliation(position),
    };
  });
}

export function mapPositionRow(row: SupabasePositionRow): Position {
  const lots = Array.isArray(row.position_lots)
    ? row.position_lots.map(normalizeLot).filter((lot) => lot.quantity > 0 || lot.type === 'RECONCILE')
    : [];

  const plans = Array.isArray(row.position_plans)
    ? row.position_plans.map(mapPositionPlanRow)
    : [];

  const summary = summarizeLots(lots);

  const fallbackQuantity = parseNumeric(row.quantity);
  const fallbackEntryPrice = parseNumeric(row.entry_price);
  const fallbackEntryDate = row.entry_date ?? new Date().toISOString();

  const quantity = summary.totalQuantity > 0
    ? summary.totalQuantity
    : lots.length > 0
      ? 0
      : fallbackQuantity;
  const entryPrice = summary.totalQuantity > 0 ? summary.averageEntryPrice : fallbackEntryPrice;
  const entryDate = summary.earliestEntryDate ?? fallbackEntryDate;

  return {
    id: row.id,
    symbol: row.symbol,
    display: row.display,
    imageUrl: row.image_url,
    entryPrice,
    quantity,
    entryDate,
    location: normalizePositionLocation(row.location),
    lots,
    plans,
    accountingIncomplete: lots.some(lot => lot.type === 'RECONCILE'),
  };
}

type RealizedBuyLot = {
  reconciledAverage?: boolean;
  id?: string;
  price: number;
  quantity: number;
  executedAt: string;
  timestamp: number;
  totalCost: number;
};

function computeRealizedSalesInternal(
  position: Position,
  getFxRateAt?: FxRateResolver,
): RealizedSale[] {
  const lots = position.lots ?? [];

  if (!lots.length) {
    return [];
  }

  const sortedLots = orderPositionLots(lots);

  const shouldIncludeFx = typeof getFxRateAt === 'function';
  const openBuys: RealizedBuyLot[] = [];
  const realized: RealizedSale[] = [];

  for (const lot of sortedLots) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
    if (lot.type === 'RECONCILE') {
      openBuys.length = 0;
      if (quantity > 0) openBuys.push({ id: lot.id, price: lot.price, quantity,
        executedAt: lot.basisAcquiredOn ?? '', timestamp: lot.basisAcquiredOn ? Date.parse(lot.basisAcquiredOn) : Number.NaN,
        totalCost: quantity * lot.price, reconciledAverage: true });
      continue;
    }
    if (quantity === 0) {
      continue;
    }

    const lotTimestamp = new Date(lot.executedAt).getTime();
    if (shouldIncludeFx && !Number.isFinite(lotTimestamp)) {
      console.warn('Skipping realized lot with invalid timestamp:', lot.executedAt);
      continue;
    }

    if (lot.type === 'BUY') {
      openBuys.push({
        id: lot.id,
        price: lot.price,
        quantity,
        executedAt: lot.executedAt,
        timestamp: lotTimestamp,
        totalCost: quantity * lot.price + (lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0),
      });
      continue;
    }

    const sellDate = new Date(lot.executedAt);
    const sellFx = shouldIncludeFx ? getFxRateAt(lotTimestamp) : 0;
    let remaining = quantity;
    let matchedQuantity = 0;
    let costBasisUsd = 0;
    let costBasisIls = 0;
    let weightedHoldingDays = 0;
    let matchedReconciledAverage = false;
    const matchedLots: NonNullable<RealizedSale['matchedLots']> = [];

    while (remaining > 0 && openBuys.length) {
      const current = openBuys[0];
      if (current.quantity <= 0) {
        openBuys.shift();
        continue;
      }
      const matched = Math.min(remaining, current.quantity);
      if (current.reconciledAverage) matchedReconciledAverage = true;

      const costPerUnit = current.quantity > 0 ? current.totalCost / current.quantity : current.price;
      const costPortion = costPerUnit * matched;
      costBasisUsd += costPortion;
      matchedLots.push({ buyTimestamp: current.timestamp, costBasisUsd: costPortion });
      costBasisIls += shouldIncludeFx ? costPortion * (Number.isFinite(current.timestamp) ? getFxRateAt(current.timestamp) : Number.NaN) : 0;
      matchedQuantity += matched;

      const buyDate = new Date(current.executedAt);
      if (!Number.isFinite(current.timestamp)) weightedHoldingDays = Number.NaN;
      if (!Number.isNaN(buyDate.getTime()) && !Number.isNaN(sellDate.getTime())) {
        const diffMs = sellDate.getTime() - buyDate.getTime();
        const diffDays = Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
        weightedHoldingDays += diffDays * matched;
      }

      current.quantity = Math.max(current.quantity - matched, 0);
      current.totalCost = Math.max(current.totalCost - costPortion, 0);
      remaining -= matched;

      if (current.quantity <= 1e-8) {
        openBuys.shift();
      }
    }

    const grossProceeds = lot.price * quantity;
    const commission = lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0;
    const proceedsUsd = grossProceeds - commission;
    const proceedsIls = proceedsUsd * sellFx;
    const averageEntryPrice = matchedQuantity > 0 ? costBasisUsd / matchedQuantity : 0;
    const profitUsd = proceedsUsd - costBasisUsd;
    const profitIls = proceedsIls - costBasisIls;
    const profitPercent = costBasisUsd > 0 ? (profitUsd / costBasisUsd) * 100 : 0;
    const holdingPeriodDays = matchedQuantity > 0 ? weightedHoldingDays / matchedQuantity : 0;

    const sale: RealizedSale = {
      id: lot.id,
      positionId: position.id,
      symbol: position.symbol,
      display: position.display,
      quantity,
      sellPrice: lot.price,
      sellDate: lot.executedAt,
      proceedsUsd,
      costBasisUsd,
      profitUsd,
      profitPercent,
      averageEntryPrice,
      holdingPeriodDays,
      matchedLots,
    };

    if (matchedReconciledAverage) sale.basisSource = 'reconciled_average';

    if (shouldIncludeFx) {
      sale.proceedsIls = proceedsIls;
      sale.costBasisIls = costBasisIls;
      sale.profitIls = profitIls;
      sale.sellUsdToIls = sellFx;
    }

    realized.push(sale);
  }

  return realized;
}

export function computeRealizedSales(position: Position): RealizedSale[] {
  return computeRealizedSalesInternal(position);
}

export function computeRealizedSalesWithFx(
  position: Position,
  getFxRateAt: FxRateResolver,
): RealizedSale[] {
  return computeRealizedSalesInternal(position, getFxRateAt);
}
