import { CircleDollarSign, Clock, KeyRound, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { translations } from '@/lib/translations';
import type { Locale, Settings } from '@/types';

type SettingsHeaderProps = {
  locale: Locale;
  settings?: Settings;
  pending?: boolean;
  failed?: boolean;
  marketOpen?: boolean;
  tokenConfigured?: boolean | null;
};

export function SettingsHeader({ locale, settings, pending = true, failed, marketOpen, tokenConfigured }: SettingsHeaderProps) {
  const t = translations[locale];
  const he = locale === 'he';
  const tokenLabel = tokenConfigured ? (he ? 'מפתח Finnhub פעיל' : 'Finnhub token connected') : (he ? 'אין מפתח Finnhub' : 'Finnhub token missing');

  return <PageHeader title={t.settings.title} subtitle={t.app.subtitle} icon={SettingsIcon}
    metaBadges={[
      { key: 'currency', icon: CircleDollarSign, loading: pending, label: failed ? '—' : `${t.settings.currency}: ${settings?.currency ?? 'USD'}` },
      { key: 'refresh', icon: RefreshCw, loading: pending, label: failed ? '—' : `${t.settings.refreshInterval}: ${settings?.refreshInterval ?? 60} ${he ? 'דקות' : 'minutes'}` },
      { key: 'market', icon: Clock, loading: marketOpen === undefined, label: marketOpen ? t.settings.refreshIntervalActive : t.settings.refreshIntervalInactive },
      { key: 'token', icon: KeyRound, loading: tokenConfigured === undefined, label: tokenConfigured === null ? 'Finnhub' : tokenLabel },
    ]}
  />;
}
