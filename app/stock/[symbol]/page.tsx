import { StockDetailView } from './stock-detail-view';

interface StockPageProps {
  params: {
    symbol: string;
  };
}

export default function StockPage({ params }: StockPageProps) {
  return <StockDetailView symbol={params.symbol} />;
}
