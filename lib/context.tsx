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

interface AppProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function AppProvider({ children, initialLocale = 'he' }: AppProviderProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [settings, setSettings] = useState<Settings>({
    annualGrowthRate: parseFloat(process.env.DEFAULT_GROWTH_RATE || '0.05'),
    currency: 'USD',
    refreshInterval: 15,
    finnhubToken: '',
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

      const savedSettings = localStorage.getItem('settings');
      if (savedSettings) {
        try {
          setSettings(JSON.parse(savedSettings));
        } catch (e) {
          console.error('Failed to parse saved settings:', e);
        }
      }

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .maybeSingle();

        if (error) throw error;

        if (data && !cancelled) {
          setSettings({
            annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
            currency: data.currency,
            refreshInterval: data.refresh_interval,
            finnhubToken: data.finnhub_token || '',
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
    document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

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
      {children}
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
