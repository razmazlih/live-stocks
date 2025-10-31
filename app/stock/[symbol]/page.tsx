import { StockDetailView } from './stock-detail-view';

type Awaitable<T> = T | Promise<T>;

interface StockPageProps {
  params: Awaitable<{
    symbol: string;
  }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  return <StockDetailView symbol={symbol} />;
}
