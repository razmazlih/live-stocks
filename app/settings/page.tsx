"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/context";
import { useAuth } from "@/components/auth/auth-provider";
import { DEMO_USER_ID } from "@/lib/demo/data";
import { useTranslation } from "@/lib/translations";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNasdaqTradingHours } from "@/lib/utils/trading-hours";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings as SettingsIcon,
  RefreshCw,
  CircleDollarSign,
  Clock,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardRouteShell } from "@/components/dashboard/dashboard-route-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardContainer, DashboardMain, DashboardSurface } from "@/components/dashboard/page-primitives";
import { AccountSettings } from "@/components/auth/account-settings";
import { InvestmentSourceSettings } from "@/components/settings/investment-source-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export default function SettingsPage() {
  const { locale, setLocale, settings, setSettings } = useApp();
  const { t } = useTranslation(locale);
  const { user } = useAuth();
  const isDemo = user.id === DEMO_USER_ID;
  const demoMessage = locale === "he"
    ? "חשבון הדמו הוא לתצוגה בלבד. לא ניתן לשמור בו הגדרות תיק. שפה ומראה ניתנים לשינוי במכשיר הזה."
    : "The demo is read-only. Portfolio settings cannot be saved. Language and appearance can still be changed on this device.";
  const [formData, setFormData] = useState(settings);
  const [saving, setSaving] = useState(false);
  const marketOpen = isNasdaqTradingHours();
  const minutesLabel = locale === "he" ? "דקות" : "minutes";
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const headerMetaBadges = [
    {
      key: "currency",
      icon: CircleDollarSign,
      label: `${t.settings.currency}: ${formData.currency}`,
      className: "bg-blue-50 text-blue-600",
      iconClassName: "text-blue-500",
    },
    {
      key: "refresh",
      icon: RefreshCw,
      label: `${t.settings.refreshInterval}: ${formData.refreshInterval} ${minutesLabel}`,
      className: "bg-white/70 text-slate-600",
      iconClassName: "text-slate-500",
    },
    {
      key: "market",
      icon: Clock,
      label: marketOpen
        ? t.settings.refreshIntervalActive
        : t.settings.refreshIntervalInactive,
      className: marketOpen
        ? "bg-emerald-50 text-emerald-600"
        : "bg-slate-100 text-slate-600",
      iconClassName: marketOpen ? "text-emerald-500" : "text-slate-500",
    },
    {
      key: "token",
      icon: KeyRound,
      label: tokenConfigured
        ? locale === "he"
          ? "מפתח Finnhub פעיל"
          : "Finnhub token connected"
        : locale === "he"
          ? "אין מפתח Finnhub"
          : "Finnhub token missing",
      className: tokenConfigured
        ? "bg-emerald-50 text-emerald-600"
        : "bg-rose-50 text-rose-600",
      iconClassName: tokenConfigured ? "text-emerald-500" : "text-rose-500",
    },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("settings")
        .select("annual_growth_rate,currency,refresh_interval")
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const loadedSettings = {
          annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
          currency: data.currency as "USD" | "ILS",
          refreshInterval: data.refresh_interval,
        };
        setFormData(loadedSettings);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      refreshInterval: settings.refreshInterval,
    }));
  }, [settings.refreshInterval]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) {
      toast.info(demoMessage);
      return;
    }
    setSaving(true);

    try {
      const supabase = getSupabaseClient();
      const { data: existing, error: lookupError } = await supabase
        .from("settings")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({
            annual_growth_rate: formData.annualGrowthRate,
            currency: formData.currency,
            refresh_interval: formData.refreshInterval,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert({
          annual_growth_rate: formData.annualGrowthRate,
          currency: formData.currency,
          refresh_interval: formData.refreshInterval,
        });

        if (error) throw error;
      }

      setSettings(formData);
      toast.success(
        locale === "he"
          ? "ההגדרות נשמרו בהצלחה"
          : "Settings saved successfully",
      );
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(
        locale === "he" ? "שגיאה בשמירת ההגדרות" : "Error saving settings",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardRouteShell activeKey="settings" locale={locale}>
      <DashboardContainer>
        <PageHeader
          title={t.settings.title}
          subtitle={t.app.subtitle}
          icon={SettingsIcon}
          metaBadges={headerMetaBadges}
        />

        <DashboardMain>
          {isDemo ? (
            <DashboardSurface>
              <h2 className="text-lg font-semibold">{locale === "he" ? "חשבון דמו" : "Demo account"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{locale === "he"
                ? "תיק הדגמה עם נתונים סינתטיים. חיבורי חשבון, מפתחות אישיים וניהול מקורות השקעה זמינים בחשבון אישי."
                : "A sample portfolio with synthetic data. Account connections, personal keys and investment source management are available in a personal account."}</p>
            </DashboardSurface>
          ) : <AccountSettings locale={locale} onCredentialChange={setTokenConfigured} />}
          <AppearanceSettings locale={locale} />
          {!isDemo && <InvestmentSourceSettings locale={locale} />}
          <DashboardSurface>
              <form onSubmit={handleSubmit} className="space-y-8">
                {isDemo && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{demoMessage}</p>}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="growthRate">
                      {t.settings.annualGrowthRate}
                    </Label>
                    <Input
                      id="growthRate"
                      disabled={isDemo}
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={formData.annualGrowthRate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          annualGrowthRate: parseFloat(e.target.value),
                        })
                      }
                    />
                    <p className="text-xs text-slate-500">
                      {locale === "he"
                        ? "ערך בין 0 ל-1 (לדוגמה: 0.05 = 5%)"
                        : "Value between 0 and 1 (e.g., 0.05 = 5%)"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t.settings.currency}</Label>
                    <Select
                      value={formData.currency}
                      disabled={isDemo}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          currency: value as "USD" | "ILS",
                        })
                      }
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refreshInterval">
                    {t.settings.refreshInterval}
                  </Label>
                  <Input
                    id="refreshInterval"
                    type="number"
                    value={formData.refreshInterval}
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-slate-500">
                    {t.settings.refreshIntervalDescription}
                  </p>
                  <p className="text-xs text-slate-500">
                    {marketOpen
                      ? t.settings.refreshIntervalActive
                      : t.settings.refreshIntervalInactive}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">
                    {locale === "he" ? "שפה" : "Language"}
                  </Label>
                  <Select
                    value={locale}
                    onValueChange={(value) => setLocale(value as "he" | "en")}
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

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={saving || isDemo}>
                    {saving
                      ? locale === "he"
                        ? "שומר..."
                        : "Saving..."
                      : t.settings.save}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setFormData(settings)}>
                    {t.settings.cancel}
                  </Button>
                </div>
              </form>
          </DashboardSurface>
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
