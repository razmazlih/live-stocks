export interface Position {
  id?: string;
  symbol: string;
  display: string;
  imageUrl: string;
  entryPrice: number;
  quantity: number;
  entryDate: string;
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

export type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'All';

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
  close: number;
}
