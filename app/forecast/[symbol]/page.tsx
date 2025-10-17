import { notFound } from 'next/navigation';

import { ForecastView } from './forecast-view';

const FORECAST_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FORECAST_URL === '1' || process.env.FORECAST_URL === '1';

interface ForecastPageProps {
  params: { symbol: string };
}

export default function ForecastPage({ params }: ForecastPageProps) {
  if (!FORECAST_FEATURE_ENABLED) {
    notFound();
  }

  const rawSymbol = params?.symbol ?? '';
  const normalizedSymbol = decodeURIComponent(rawSymbol).trim().toUpperCase();

  if (!normalizedSymbol || !/^[A-Z0-9.\-]+$/.test(normalizedSymbol)) {
    notFound();
  }

  return <ForecastView symbol={normalizedSymbol} />;
}
