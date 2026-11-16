import { PublicInformation } from '@/components/public-information';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'About / אודות · LiveStocks' };

export default function AboutPage(props: { searchParams: Promise<{ lang?: string }> }) {
  return <PublicInformation kind="about" {...props} />;
}
