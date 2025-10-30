'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isNasdaqTradingHours } from '@/lib/utils/trading-hours';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { locale, setLocale, settings, setSettings } = useApp();
  const { t } = useTranslation(locale);
  const [formData, setFormData] = useState(settings);
  const [saving, setSaving] = useState(false);
  const marketOpen = isNasdaqTradingHours();

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const loadedSettings = {
          annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
          currency: data.currency as 'USD' | 'ILS',
          refreshInterval: data.refresh_interval,
          finnhubToken: data.finnhub_token || '',
        };
        setFormData(loadedSettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  useEffect(() => {
    setFormData(prev => ({ ...prev, refreshInterval: settings.refreshInterval }));
  }, [settings.refreshInterval]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const supabase = getSupabaseClient();
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({
            annual_growth_rate: formData.annualGrowthRate,
            currency: formData.currency,
            refresh_interval: formData.refreshInterval,
            finnhub_token: formData.finnhubToken,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert({
            annual_growth_rate: formData.annualGrowthRate,
            currency: formData.currency,
            refresh_interval: formData.refreshInterval,
            finnhub_token: formData.finnhubToken,
          });

        if (error) throw error;
      }

      setSettings(formData);
      toast.success(locale === 'he' ? 'ההגדרות נשמרו בהצלחה' : 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(locale === 'he' ? 'שגיאה בשמירת ההגדרות' : 'Error saving settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]">
      <div className="max-w-3xl mx-auto p-6">
        <header className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {locale === 'he' ? 'חזרה' : 'Back'}
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-[#0F172A]">{t.settings.title}</h1>
        </header>

        <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="growthRate">{t.settings.annualGrowthRate}</Label>
              <Input
                id="growthRate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.annualGrowthRate}
                onChange={(e) => setFormData({ ...formData, annualGrowthRate: parseFloat(e.target.value) })}
              />
              <p className="text-sm text-gray-500">
                {locale === 'he' ? 'ערך בין 0 ל-1 (לדוגמה: 0.05 = 5%)' : 'Value between 0 and 1 (e.g., 0.05 = 5%)'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t.settings.currency}</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value as 'USD' | 'ILS' })}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ILS">ILS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refreshInterval">{t.settings.refreshInterval}</Label>
              <Input
                id="refreshInterval"
                type="number"
                value={formData.refreshInterval}
                readOnly
                disabled
              />
              <p className="text-sm text-gray-500">{t.settings.refreshIntervalDescription}</p>
              <p className="text-sm text-gray-500">
                {marketOpen ? t.settings.refreshIntervalActive : t.settings.refreshIntervalInactive}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finnhubToken">{t.settings.finnhubToken}</Label>
              <Input
                id="finnhubToken"
                type="password"
                value={formData.finnhubToken}
                onChange={(e) => setFormData({ ...formData, finnhubToken: e.target.value })}
                placeholder="Enter your Finnhub API token"
              />
              <p className="text-sm text-gray-500">
                {locale === 'he' ? 'ניתן להשיג מפתח בחינם מ-' : 'Get a free token from '}
                <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">
                  finnhub.io
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{locale === 'he' ? 'שפה' : 'Language'}</Label>
              <Select
                value={locale}
                onValueChange={(value) => setLocale(value as 'he' | 'en')}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="he">עברית</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? (locale === 'he' ? 'שומר...' : 'Saving...') : t.settings.save}
              </Button>
              <Link href="/">
                <Button type="button" variant="outline">
                  {t.settings.cancel}
                </Button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
