export type PositionLotType = 'BUY' | 'SELL';

export interface PositionLot {
  id?: string;
  positionId?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
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
  expectedPnLUsd: number;
  expectedPnLIls: number;
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

export interface PositionAnalytics {
  symbol: string;
  display: string;
  cagr: number;
  maxDrawdown: number;
  annualizedVolatility30?: number;
  annualizedVolatility90?: number;
  meanDailyReturn?: number;
  medianDailyReturn?: number;
  stdDevDailyReturn?: number;
  minDailyReturn?: number;
  maxDailyReturn?: number;
  percentile5?: number;
  percentile95?: number;
  valueAtRisk95?: number;
  expectedShortfall95?: number;
  observations: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  values: number[][];
}

export interface PortfolioAnalytics {
  sharpeRatio?: number;
  sortinoRatio?: number;
  annualizedVolatility?: number;
  valueAtRisk95?: number;
  expectedShortfall95?: number;
  beta?: number;
  correlationMatrix?: CorrelationMatrix | null;
  herfindahlIndex: number;
}

export interface RebalanceSuggestion {
  symbol: string;
  display?: string;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
  currentValue: number;
  targetValue: number;
  action: 'buy' | 'sell' | 'hold';
  unitsToTrade: number;
}

export interface CurrencyExposure {
  baseCurrency: 'USD' | 'ILS';
  usdValue: number;
  ilsValue: number;
  exposureByPosition: Array<{
    symbol: string;
    display: string;
    usdValue: number;
    ilsValue: number;
    weight: number;
  }>;
}

export interface WhatIfScenario {
  usdIlsRate: number;
  totalValueUsd: number;
  totalValueIls: number;
}
