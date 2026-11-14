'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { Locale, Settings } from '@/types';
import { PortfolioDataProvider } from '@/hooks/use-portfolio-data';
import { getSupabaseClient } from '@/lib/supabase';
import { getNasdaqRefreshInterval } from '@/lib/utils/trading-hours';

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('he');
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
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && (savedLocale === 'he' || savedLocale === 'en')) {
        setLocale(savedLocale);
      }

      // Delete the legacy shared credential cache; personal settings are database-owned.
      localStorage.removeItem('settings');

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

    void initializeSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('locale', locale);
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

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
        setLocale,
        settings,
        setSettings,
        settingsReady,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      <PortfolioDataProvider>{children}</PortfolioDataProvider>
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
