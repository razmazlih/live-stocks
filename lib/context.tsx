'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { Locale, Settings } from '@/types';
import { supabase } from '@/lib/supabase';
import { getNasdaqRefreshInterval } from '@/lib/utils/trading-hours';
import { processPendingPlans } from '@/lib/plans';
import { useTranslation } from '@/lib/translations';
import { toast } from 'sonner';

interface AppContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  processPlans: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('he');
  const [settings, setSettings] = useState<Settings>({
    annualGrowthRate: parseFloat(process.env.DEFAULT_GROWTH_RATE || '0.05'),
    currency: 'USD',
    refreshInterval: 15,
    finnhubToken: '',
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [settingsReady, setSettingsReady] = useState(false);
  const planProcessingRef = useRef(false);
  const tokenWarningShownRef = useRef(false);
  const { t } = useTranslation(locale);

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
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const {
    planProcessingMissingToken,
    planProcessingTriggered,
    planProcessingExpired,
    planProcessingPartial,
    planProcessingError,
  } = t.positions;

  const processPlans = useCallback(async () => {
    if (!settingsReady) {
      return;
    }

    if (planProcessingRef.current) {
      return;
    }

    if (!settings.finnhubToken) {
      if (!tokenWarningShownRef.current) {
        toast.warning(planProcessingMissingToken);
        tokenWarningShownRef.current = true;
      }
    } else {
      tokenWarningShownRef.current = false;
    }

    planProcessingRef.current = true;

    try {
      const result = await processPendingPlans({ token: settings.finnhubToken });
      const hadChanges = result.triggered.length > 0 || result.expired.length > 0;

      if (result.triggered.length > 0) {
        toast.success(planProcessingTriggered(result.triggered.length));
      }

      if (result.expired.length > 0) {
        toast.info(planProcessingExpired(result.expired.length));
      }

      if (result.errors.length > 0) {
        toast.error(planProcessingPartial(result.errors.length));
      }

      if (hadChanges) {
        triggerRefresh();
      }
    } catch (error) {
      console.error('Failed to process plans automatically:', error);
      toast.error(planProcessingError);
    } finally {
      planProcessingRef.current = false;
    }
  }, [
    settingsReady,
    settings.finnhubToken,
    planProcessingMissingToken,
    planProcessingTriggered,
    planProcessingExpired,
    planProcessingPartial,
    planProcessingError,
    triggerRefresh,
  ]);

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      await processPlans();
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [processPlans, settingsReady]);

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
        refreshTrigger,
        triggerRefresh,
        processPlans,
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
