import { StockDetailView } from './stock-detail-view';

export const dynamic = 'force-dynamic';

interface StockPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  return <StockDetailView symbol={symbol} />;
}
