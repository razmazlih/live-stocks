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
  totalValue: number;
  totalCost: number;
  usdToIlsRate: number;
}

export interface PortfolioTimelinePoint {
  timestamp: number;
  totalPnLUsd: number;
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

export interface SparklineSeries {
  closes: number[];
  timestamps: number[];
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

export interface IndicatorSeriesPoint extends HistoricalPoint {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  atr14?: number;
}

export type DivergenceSignal = 'positive' | 'negative' | 'none';

export type ChecklistKey = 'trend' | 'rsi' | 'macd' | 'volume' | 'supportResistance' | 'riskReward';

export interface ChecklistItem<TContext = Record<string, unknown>> {
  key: ChecklistKey;
  passed: boolean;
  context?: TContext;
  weight: number;
}

export interface SupportResistanceLevels {
  supports: number[];
  resistances: number[];
  swingHigh?: {
    timestamp: number;
    price: number;
  };
  swingLow?: {
    timestamp: number;
    price: number;
  };
  lastBreakout?: {
    timestamp: number;
    price: number;
  };
  lastBreakdown?: {
    timestamp: number;
    price: number;
  };
}

export interface DivergenceSummary {
  rsi: DivergenceSignal;
  macd: DivergenceSignal;
}

export interface StockIndicatorSnapshot {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bollinger?: {
    upper?: number;
    middle?: number;
    lower?: number;
  };
  atr?: number;
}

export interface RiskRewardPlan {
  stop?: number;
  target?: number;
  rr?: number;
}

export interface StockAnalysisResult {
  series: IndicatorSeriesPoint[];
  indicators: StockIndicatorSnapshot;
  supportResistance: SupportResistanceLevels;
  divergences: DivergenceSummary;
  volume: {
    latest?: number;
    average20?: number;
  };
  checklist: ChecklistItem[];
  score: number;
  verdict: 'BUY' | 'SELL' | 'NEUTRAL';
  riskReward: RiskRewardPlan;
  periodHigh?: number;
  periodLow?: number;
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
