'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, Settings } from '@/types';

interface AppContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  settings: Settings;
  setSettings: (settings: Settings) => void;
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
    finnhubToken: '',
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    localStorage.setItem('locale', locale);
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <AppContext.Provider
      value={{
        locale,
        setLocale,
        settings,
        setSettings,
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
