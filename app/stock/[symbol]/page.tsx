import { notFound } from 'next/navigation';

import { StockDetailView } from './stock-detail-view';

interface StockPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol?.trim();

  if (!symbol) {
    notFound();
  }

  return <StockDetailView symbol={symbol} />;
}
