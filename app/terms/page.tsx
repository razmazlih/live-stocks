import { PublicInformation } from '@/components/public-information';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terms / תנאי שימוש · LiveStocks' };

export default function TermsPage(props: { searchParams: Promise<{ lang?: string }> }) {
  return <PublicInformation kind="terms" {...props} />;
}
