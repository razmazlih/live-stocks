export type PositionLotType = 'BUY' | 'SELL';

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
}

export interface Position {
  id?: string;
  symbol: string;
  display: string;
  imageUrl: string;
  entryPrice: number;
  quantity: number;
  entryDate: string;
  lots?: PositionLot[];
  plans?: PositionPlan[];
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
  position: Position;
  currentPrice: number;
  positionPnLUsd: number;
  positionPnLIls: number;
  projectedPrice: number;
  projectedPnLUsd: number;
  projectedPnLIls: number;
  combined: number;
  combinedIls: number;
  yearsHeld: number;
  currentValue: number;
  roiPercent: number;
  dailyChange?: number;
  dailyChangePercent?: number;
}

export interface PortfolioSummary {
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
  timestamp: number;
  totalPnLUsd: number;
  totalPnLIls: number;
  netPnLUsd: number;
  netPnLIls: number;
  expectedNetPnLUsd: number;
  expectedNetPnLIls: number;
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

export interface ForecastPriceHistoryPoint {
  date: string;
  close?: number;
  price?: number;
  [key: string]: string | number | undefined;
}

export interface ForecastApiResponse {
  ticker: string;
  horizon: number;
  price_quantiles: Record<string, number>;
  price_history?: ForecastPriceHistoryPoint[];
  generated_at?: string;
  [key: string]: unknown;
}
