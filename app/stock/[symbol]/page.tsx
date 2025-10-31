import { StockDetailView } from './stock-detail-view';

interface StockPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  const decodedSymbol = typeof symbol === 'string' ? decodeURIComponent(symbol) : '';

  return <StockDetailView symbol={decodedSymbol} />;
}
