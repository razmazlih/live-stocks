import {
  Position,
  PositionLocation,
  PositionLot,
  PositionLotType,
  PositionPlan,
  RealizedSale,
} from '@/types';

export const DEFAULT_COMMISSION_USD = 8;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

interface SupabasePositionLot {
  id: string;
  position_id: string;
  side: PositionLotType;
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
}

export interface PositionSummary {
  openLots: OpenLot[];
  totalQuantity: number;
  costBasis: number;
  averageEntryPrice: number;
  earliestEntryDate?: string;
  weightedHoldingYears: number;
}

export interface PositionActivation {
  activationId: string;
  baseId: string;
  position: Position;
  symbol: string;
  isOpen: boolean;
  startTimestamp: number | null;
  endTimestamp: number | null;
  lastSalePrice: number | null;
  lastSaleTimestamp: number | null;
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

export function computeOpenLots(lots: PositionLot[]): OpenLot[] {
  if (!lots.length) {
    return [];
  }

  const sorted = [...lots].sort((a, b) => {
    const aTime = new Date(a.executedAt).getTime();
    const bTime = new Date(b.executedAt).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }
    return aTime - bTime;
  });

  const queue: OpenLot[] = [];

  for (const lot of sorted) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
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
          return acc;
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

const QUANTITY_EPSILON = 1e-6;

function buildActivationPosition(
  source: Position,
  lots: PositionLot[],
  isOpen: boolean,
  activationId: string
): PositionActivation {
  const clonedLots = lots.map((lot) => ({ ...lot }));
  const baseId = source.id ?? source.symbol;
  const openLots = computeOpenLots(clonedLots);
  const openQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const openCostBasis = openLots.reduce((sum, lot) => sum + lot.totalCost, 0);

  const buyTotals = clonedLots.reduce(
    (acc, lot) => {
      if (lot.type !== 'BUY') {
        return acc;
      }

      const commission = lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0;
      acc.quantity += lot.quantity;
      acc.cost += lot.quantity * lot.price + commission;
      return acc;
    },
    { quantity: 0, cost: 0 }
  );

  const activationEntryPrice = isOpen
    ? openQuantity > QUANTITY_EPSILON
      ? openCostBasis / openQuantity
      : source.entryPrice
    : buyTotals.quantity > QUANTITY_EPSILON
      ? buyTotals.cost / buyTotals.quantity
      : source.entryPrice;

  const earliestBuy = clonedLots.reduce<{ timestamp: number | null; iso: string | null }>(
    (acc, lot) => {
      if (lot.type !== 'BUY') {
        return acc;
      }

      const executedAt = new Date(lot.executedAt);
      const time = executedAt.getTime();
      if (Number.isNaN(time)) {
        return acc;
      }

      if (acc.timestamp === null || time < acc.timestamp) {
        return { timestamp: time, iso: lot.executedAt };
      }

      return acc;
    },
    { timestamp: null, iso: null }
  );

  const activationEntryDate = earliestBuy.iso ?? source.entryDate;

  const lastLotTimestamp = clonedLots.reduce<number | null>((latest, lot) => {
    const executedAt = new Date(lot.executedAt);
    const time = executedAt.getTime();
    if (Number.isNaN(time)) {
      return latest;
    }

    if (latest === null || time > latest) {
      return time;
    }

    return latest;
  }, null);

  let lastSalePrice: number | null = null;
  let lastSaleTimestamp: number | null = null;

  clonedLots.forEach((lot) => {
    if (lot.type !== 'SELL') {
      return;
    }
    const executedAt = new Date(lot.executedAt);
    const time = executedAt.getTime();
    if (Number.isNaN(time)) {
      return;
    }

    if (lastSaleTimestamp === null || time >= lastSaleTimestamp) {
      lastSaleTimestamp = time;
      lastSalePrice = lot.price;
    }
  });

  const positionClone: Position = {
    ...source,
    id: isOpen ? baseId : activationId,
    quantity: isOpen ? openQuantity : 0,
    entryPrice: activationEntryPrice,
    entryDate: activationEntryDate,
    lots: clonedLots,
  };

  return {
    activationId,
    baseId,
    position: positionClone,
    symbol: source.symbol,
    isOpen,
    startTimestamp: earliestBuy.timestamp,
    endTimestamp: isOpen ? null : lastLotTimestamp,
    lastSalePrice: isOpen ? null : lastSalePrice,
    lastSaleTimestamp: isOpen ? null : lastSaleTimestamp,
  };
}

export function extractPositionActivations(position: Position): PositionActivation[] {
  const lots = position.lots ?? [];

  if (!lots.length) {
    if (position.quantity > QUANTITY_EPSILON) {
      const baseId = position.id ?? position.symbol;
      const entryDate = new Date(position.entryDate);
      const entryTime = Number.isNaN(entryDate.getTime()) ? null : entryDate.getTime();
      return [
        {
          activationId: `${baseId}::activation-0`,
          baseId,
          position: { ...position },
          symbol: position.symbol,
          isOpen: true,
          startTimestamp: entryTime,
          endTimestamp: null,
          lastSalePrice: null,
          lastSaleTimestamp: null,
        },
      ];
    }

    return [];
  }

  const sortedLots = lots
    .filter((lot) => Number.isFinite(lot.quantity) && lot.quantity > QUANTITY_EPSILON)
    .sort((a, b) => {
      const aTime = new Date(a.executedAt).getTime();
      const bTime = new Date(b.executedAt).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0;
      }
      return aTime - bTime;
    });

  if (!sortedLots.length) {
    return [];
  }

  const activations: PositionActivation[] = [];
  let activationLots: PositionLot[] = [];
  let balance = 0;
  let activationIndex = 0;

  for (const lot of sortedLots) {
    const quantity = Math.max(lot.quantity, 0);
    if (quantity <= QUANTITY_EPSILON) {
      continue;
    }

    const isBuy = lot.type === 'BUY';
    if (isBuy && balance <= QUANTITY_EPSILON && activationLots.length > 0) {
      activationLots = [];
    }

    activationLots.push(lot);

    if (isBuy) {
      balance += quantity;
    } else {
      balance -= quantity;

      if (balance <= QUANTITY_EPSILON) {
        const activationId = `${position.id ?? position.symbol}::activation-${activationIndex}`;
        activations.push(buildActivationPosition(position, activationLots, false, activationId));
        activationIndex += 1;
        balance = 0;
        activationLots = [];
      }
    }
  }

  if (activationLots.length > 0 && balance > QUANTITY_EPSILON) {
    const activationId = `${position.id ?? position.symbol}::activation-${activationIndex}`;
    activations.push(buildActivationPosition(position, activationLots, true, activationId));
  }

  return activations;
}

export function mapPositionRow(row: SupabasePositionRow): Position {
  const lots = Array.isArray(row.position_lots)
    ? row.position_lots.map(normalizeLot).filter((lot) => lot.quantity > 0)
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
  };
}

export function computeRealizedSales(position: Position): RealizedSale[] {
  const lots = position.lots ?? [];

  if (!lots.length) {
    return [];
  }

  const sortedLots = [...lots].sort((a, b) => {
    const aTime = new Date(a.executedAt).getTime();
    const bTime = new Date(b.executedAt).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }
    return aTime - bTime;
  });

  type BuyLot = {
    id?: string;
    price: number;
    quantity: number;
    executedAt: string;
    totalCost: number;
  };

  const openBuys: BuyLot[] = [];
  const realized: RealizedSale[] = [];

  for (const lot of sortedLots) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
    if (quantity === 0) {
      continue;
    }

    if (lot.type === 'BUY') {
      openBuys.push({
        id: lot.id,
        price: lot.price,
        quantity,
        executedAt: lot.executedAt,
        totalCost: quantity * lot.price + (lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0),
      });
      continue;
    }

    const sellDate = new Date(lot.executedAt);
    let remaining = quantity;
    let matchedQuantity = 0;
    let costBasisUsd = 0;
    let weightedHoldingDays = 0;

    while (remaining > 0 && openBuys.length) {
      const current = openBuys[0];
      if (current.quantity <= 0) {
        openBuys.shift();
        continue;
      }
      const matched = Math.min(remaining, current.quantity);

      const costPerUnit = current.quantity > 0 ? current.totalCost / current.quantity : current.price;
      const costPortion = costPerUnit * matched;
      costBasisUsd += costPortion;
      matchedQuantity += matched;

      const buyDate = new Date(current.executedAt);
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
    const averageEntryPrice = matchedQuantity > 0 ? costBasisUsd / matchedQuantity : 0;
    const profitUsd = proceedsUsd - costBasisUsd;
    const profitPercent = costBasisUsd > 0 ? (profitUsd / costBasisUsd) * 100 : 0;
    const holdingPeriodDays = matchedQuantity > 0 ? weightedHoldingDays / matchedQuantity : 0;

    realized.push({
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
    });
  }

  return realized;
}
