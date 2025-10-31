import { notFound } from 'next/navigation';

import { ForecastView } from './forecast-view';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';

interface ForecastPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

export default async function ForecastPage({ params }: ForecastPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol?.trim();

  if (!symbol) {
    notFound();
  }

  if (!FORECAST_FEATURE_ENABLED) {
    notFound();
  }

  return <ForecastView symbol={symbol} />;
}
