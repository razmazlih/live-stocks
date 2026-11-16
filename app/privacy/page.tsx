import { PublicInformation } from '@/components/public-information';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy / פרטיות · LiveStocks' };

export default function PrivacyPage(props: { searchParams: Promise<{ lang?: string }> }) {
  return <PublicInformation kind="privacy" {...props} />;
}
