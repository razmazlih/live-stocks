import { notFound } from 'next/navigation';

import { ForecastView } from './forecast-view';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';

interface ForecastPageProps {
  params: {
    symbol: string;
  };
}

export default function ForecastPage({ params }: ForecastPageProps) {
  if (!FORECAST_FEATURE_ENABLED) {
    notFound();
  }

  return <ForecastView symbol={params.symbol} />;
}
