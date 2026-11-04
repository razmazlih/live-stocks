export type PositionLotType = 'BUY' | 'SELL';
export type PositionLocation = 'bank_one' | 'bank_two';

export interface PositionLot {
  id?: string;
  positionId?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
  hasCommission: boolean;
  commissionAmount: number;
}

export type PositionPlanStatus = 'pending' | 'triggered' | 'expired' | 'cancelled';
export type PositionPlanSide = 'buy' | 'sell';

export interface PositionPlan {
  id?: string;
  positionId?: string | null;
  symbol: string;
  display?: string | null;
  imageUrl?: string | null;
  side: PositionPlanSide;
  targetPrice: number;
  targetQuantity: number;
  targetDate: string;
  hasCommission: boolean;
  commissionAmount: number;
  status: PositionPlanStatus;
  triggeredAt?: string | null;
  expiredAt?: string | null;
  executedPrice?: number | null;
  createdAt?: string;
  updatedAt?: string;
  location?: PositionLocation | null;
}

export interface Position {
  id?: string;
  symbol: string;
  display: string;
  imageUrl: string;
  entryPrice: number;
  quantity: number;
  entryDate: string;
  location: PositionLocation;
  lots?: PositionLot[];
  plans?: PositionPlan[];
  /** Identifier tying this instance to a specific activation lifecycle */
  activationId?: string;
  /** Sequential index (0-based) of the activation for the symbol */
  activationIndex?: number;
  /** ISO timestamp for when this activation began */
  activationStart?: string | null;
  /** ISO timestamp for when this activation ended (null for active) */
  activationEnd?: string | null;
  /** Whether this activation represents a fully closed historical cycle */
  isHistoricalActivation?: boolean;
  /** Original persistent identifier of the position record */
  originalId?: string;
}

export interface RealizedSale {
  id?: string;
  positionId?: string;
  symbol: string;
  display: string;
  quantity: number;
  sellPrice: number;
  sellDate: string;
  proceedsUsd: number;
  costBasisUsd: number;
  profitUsd: number;
  profitPercent: number;
  averageEntryPrice: number;
  holdingPeriodDays: number;
  proceedsIls?: number;
  costBasisIls?: number;
  profitIls?: number;
  sellUsdToIls?: number;
  matchedLots?: Array<{ buyTimestamp: number; costBasisUsd: number }>;
}

export interface StockQuote {
  c: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
  v?: number;
}

export interface WatchlistTicker {
  id?: string;
  groupId?: string;
  symbol: string;
  display?: string;
  imageUrl?: string;
  note?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WatchlistGroup {
  id?: string;
  name: string;
  description?: string;
  tickers: WatchlistTicker[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ExchangeRateResponse {
  result: string;
  rates: {
    ILS: number;
    [key: string]: number;
  };
}

export interface PositionMetrics {
  commissionUsd?: number;
  commissionIls?: number;
  position: Position;
  currentPrice: number;
  positionPnLUsd: number;
  positionPnLIls: number;
  projectedPrice: number;
  /** Price needed to exit all open shares while meeting the annual target across this symbol's history. */
  requiredExitPrice?: number;
  projectedPnLUsd: number;
  projectedPnLIls: number;
  combined: number;
  combinedIls: number;
  yearsHeld: number;
  currentValue: number;
  currentValueIls: number;
  roiPercent: number;
  dailyChange?: number;
  dailyChangePercent?: number;
}

export type SymbolExceptionStatus = 'open' | 'closed' | 'invalid';

/**
 * One annual-target assessment for all position lifecycles belonging to a symbol.
 * Monetary fields are USD and `gap` compares the full-history exit target to the
 * weighted annual target of the still-open lots.
 */
export interface SymbolExceptionAssessment {
  symbol: string;
  display: string;
  imageUrl: string;
  status: SymbolExceptionStatus;
  positions: Position[];
  openQuantity: number;
  currentPrice?: number;
  projectedPrice?: number;
  requiredExitPrice?: number;
  /** Required-exit price minus the weighted projected price. */
  gapUsd?: number;
  gapPercent?: number;
  /** Required proceeds at the current price, minus the proceeds needed to meet target. */
  currentGapUsd?: number;
  realizedProfitUsd: number;
  expectedProfitUsd: number;
  actualProfitUsd: number;
  profitGapUsd: number;
  invalidReason?: string;
}

export interface PortfolioSummary {
  /** Cumulative transaction commissions, already deducted from P/L. */
  totalCommissionsUsd?: number;
  totalCommissionsIls?: number;
  totalCurrentPnLUsd: number;
  totalCurrentPnLIls: number;
  totalProjectedPnLUsd: number;
  totalProjectedPnLIls: number;
  totalCombinedUsd: number;
  totalCombinedIls: number;
  totalRealizedProfitUsd: number;
  totalRealizedProfitIls: number;
  totalTaxesPaidUsd: number;
  totalTaxesPaidIls: number;
  totalNetPnLUsd: number;
  totalNetPnLIls: number;
  totalValue: number;
  totalCost: number;
  usdToIlsRate: number;
}

export interface PortfolioTimelinePoint {
  /** Cumulative commissions paid through this valuation, at transaction-date FX. */
  commissionUsd?: number;
  commissionIls?: number;
  timestamp: number;
  totalPnLUsd: number;
  totalPnLIls: number;
  netPnLUsd: number;
  netPnLIls: number;
  expectedNetPnLUsd: number;
  expectedNetPnLIls: number;
  spyNetPnLUsd: number;
  spyNetPnLIls: number;
}

export interface Settings {
  annualGrowthRate: number;
  currency: 'USD' | 'ILS';
  refreshInterval: number;
  finnhubToken: string;
}

export interface CandleData {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];
  v: number[];
  s: string;
}

export type TimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'All';

export type Locale = 'he' | 'en';

export interface PortfolioAllocationDatum {
  symbol: string;
  display: string;
  valueUsd: number;
  valueIls: number;
  percentage: number;
}

export interface PortfolioPnLDatum {
  symbol: string;
  display: string;
  currentPnLUsd: number;
  projectedPnLUsd: number;
  currentValue: number;
}

export interface HistoricalPoint {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}
