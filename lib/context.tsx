'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { usePathname } from 'next/navigation';
import { Locale, Settings } from '@/types';
import { PortfolioDataProvider } from '@/hooks/use-portfolio-data';
import { getSupabaseClient } from '@/lib/supabase';
import { getNasdaqRefreshInterval } from '@/lib/utils/trading-hours';
import { InvestmentSourcesProvider } from '@/hooks/use-investment-sources';
import { readDemoSettings } from '@/lib/demo/settings';
import { readDemoPreferences, saveDemoPreferences } from '@/lib/demo/client';
import { mirrorDemoEntryLocale, readPersonalLocale } from '@/lib/entry-locale';
import { toast } from 'sonner';

interface AppContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  settingsReady: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children, demo = false, initialDemoLocale }: { children: ReactNode; demo?: boolean; initialDemoLocale?: Locale }) {
  const path = usePathname();
  const portfolioScope = path === '/' ? 'overview' : path === '/portfolio' ? 'performance' : 'idle';
  const [locale, setLocale] = useState<Locale>(() => demo ? initialDemoLocale ?? 'he' : readPersonalLocale());
  const [settings, setSettings] = useState<Settings>({
    annualGrowthRate: parseFloat(process.env.DEFAULT_GROWTH_RATE || '0.05'),
    currency: 'USD',
    refreshInterval: 15,
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeSettings = async () => {
      const savedLocale = demo ? initialDemoLocale ?? (await readDemoPreferences()).locale : readPersonalLocale();
      if (!cancelled && savedLocale && (savedLocale === 'he' || savedLocale === 'en')) {
        setLocale(savedLocale);
      }

      // Delete the legacy shared credential cache; personal settings are database-owned.
      localStorage.removeItem('settings');

      if (demo) {
        const saved = await readDemoSettings();
        if (saved && !cancelled) setSettings(saved);
        if (!cancelled) setSettingsReady(true);
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('settings')
          .select('annual_growth_rate,currency,refresh_interval')
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        if (data && !cancelled) {
          setSettings({
            annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
            currency: data.currency,
            refreshInterval: data.refresh_interval,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load settings from Supabase:', error);
        }
      } finally {
        if (!cancelled) {
          setSettingsReady(true);
        }
      }
    };

    void initializeSettings().catch(() => {
      if (!cancelled) {
        setSettingsReady(true);
        toast.error('לא ניתן לטעון את הגדרות החשבון המקומי / Could not load local account settings');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [demo, initialDemoLocale]);

  useEffect(() => {
    if (demo) mirrorDemoEntryLocale(locale);
    else localStorage.setItem('locale', locale);
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale, demo]);

  const changeLocale = useCallback((value: Locale) => {
    if (!demo) { setLocale(value); return; }
    void saveDemoPreferences({ locale: value }).then(() => setLocale(value)).catch(() => {
      toast.error(locale === 'he' ? 'לא ניתן לשמור את שפת הדמו במחשב' : 'Could not save the demo language on this computer');
    });
  }, [demo, locale]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    const updateRefreshInterval = () => {
      const newInterval = getNasdaqRefreshInterval();
      setSettings(prev => {
        if (prev.refreshInterval === newInterval) {
          return prev;
        }

        return {
          ...prev,
          refreshInterval: newInterval,
        };
      });
    };

    updateRefreshInterval();

    const intervalId = setInterval(updateRefreshInterval, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [setSettings]);

  return (
    <AppContext.Provider
      value={{
        locale,
        setLocale: changeLocale,
        settings,
        setSettings,
        settingsReady,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      <InvestmentSourcesProvider><PortfolioDataProvider scope={portfolioScope}>{children}</PortfolioDataProvider></InvestmentSourcesProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
