import { notFound } from 'next/navigation';

import { ForecastView } from './forecast-view';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';

interface ForecastPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

export default async function ForecastPage({ params }: ForecastPageProps) {
  if (!FORECAST_FEATURE_ENABLED) {
    notFound();
  }

  const { symbol } = await params;

  return <ForecastView symbol={symbol} />;
}
