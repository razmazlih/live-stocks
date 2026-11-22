"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/context";
import { useAuth } from "@/components/auth/auth-provider";
import { DEMO_USER_ID } from "@/lib/demo/data";
import { readDemoSettings, saveDemoSettings } from "@/lib/demo/settings";
import { resetComputerDemo } from "@/lib/demo/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/translations";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SettingsFormSkeleton } from "@/components/settings/settings-skeleton";
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
import { toast } from "sonner";
import { DashboardRouteShell } from "@/components/dashboard/dashboard-route-shell";
import { SettingsHeader } from "@/components/settings/settings-header";
import { DashboardContainer, DashboardMain, DashboardSurface } from "@/components/dashboard/page-primitives";
import { AccountSettings } from "@/components/auth/account-settings";
import { InvestmentSourceSettings } from "@/components/settings/investment-source-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export default function SettingsPage() {
  const { locale, setLocale, settings, setSettings } = useApp();
  const { t } = useTranslation(locale);
  const { user, signOut } = useAuth();
  const isDemo = user.id === DEMO_USER_ID;
  const demoMessage = locale === "he"
    ? "כל נתוני הדמו נשמרים בקובץ במחשב הזה ומשותפים לכל הדפדפנים, גם לאחר הפעלה מחדש. הם אינם נשלחים למסד הנתונים של החשבון האישי."
    : "Demo data is saved in a file on this computer, shared across browsers and retained after restarts. It never goes to your personal account database.";
  const [formData, setFormData] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const marketOpen = isNasdaqTradingHours();
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null | undefined>(isDemo ? false : undefined);

  useEffect(() => {
    let active = true;
    setLoadingSettings(true);
    setSettingsLoadError(false);
    async function loadSettings() {
      try {
        if (isDemo) {
          const saved = await readDemoSettings();
          if (saved && active) setFormData(saved);
          return;
        }
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("settings")
          .select("annual_growth_rate,currency,refresh_interval")
          .eq("is_active", true)
          .maybeSingle();
        if (error) throw error;
        if (data && active) setFormData({
          annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
          currency: data.currency as "USD" | "ILS",
          refreshInterval: data.refresh_interval,
        });
      } catch (error) {
        if (active) {
          setSettingsLoadError(true);
          console.error("Error loading settings:", error);
          if (isDemo) toast.error("לא ניתן לטעון את הגדרות הדמו מהמחשב / Could not load demo settings from this computer");
        }
      } finally {
        if (active) setLoadingSettings(false);
      }
    }
    void loadSettings();
    return () => { active = false; };
  }, [isDemo]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      refreshInterval: settings.refreshInterval,
    }));
  }, [settings.refreshInterval]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loadingSettings || settingsLoadError) return;
    setSaving(true);

    try {
      if (isDemo) {
        await saveDemoSettings(formData);
        setSettings(formData);
        toast.success(locale === "he" ? "הגדרות הדמו נשמרו במחשב לכל הדפדפנים" : "Demo settings saved on this computer for all browsers");
        return;
      }
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

  async function handleResetDemo() {
    if (resetting) return;
    setResetting(true);
    try {
      await resetComputerDemo();
      window.location.reload();
    } catch {
      toast.error(locale === "he" ? "איפוס הדמו לא הושלם. הנתונים לא אופסו." : "The demo reset did not complete. Data was not reset.");
      setResetting(false);
    }
  }

  return (
    <DashboardRouteShell activeKey="settings" locale={locale}>
      <DashboardContainer>
        <SettingsHeader locale={locale} settings={formData} pending={loadingSettings} failed={settingsLoadError}
          marketOpen={marketOpen} tokenConfigured={tokenConfigured} />

        <DashboardMain>
          {isDemo ? (
            <DashboardSurface>
              <h2 className="text-lg font-semibold">{locale === "he" ? "חשבון דמו" : "Demo account"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{locale === "he"
                ? "חשבון מקומי עם נתונים סינתטיים. עסקאות, מקורות השקעה, רשימות מעקב והגדרות נשמרים במחשב הזה. חיבורים לחשבון אישי ולשירותים חיצוניים אינם מופעלים בדמו."
                : "A local account with synthetic data. Transactions, investment sources, watchlists and settings are saved on this computer. Personal account connections and external integrations remain unavailable in demo."}</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => { void signOut(); }}>{locale === "he" ? "יציאה מהדמו" : "Sign out of demo"}</Button>
            </DashboardSurface>
          ) : <AccountSettings locale={locale} onCredentialChange={setTokenConfigured} />}
          <AppearanceSettings locale={locale} demo={isDemo} />
          <InvestmentSourceSettings locale={locale} />
          <DashboardSurface>
            {loadingSettings ? (
              <SettingsFormSkeleton locale={locale} demo={isDemo} />
            ) : settingsLoadError ? (
              <p role="alert">{locale === "he" ? "לא ניתן לטעון את ההגדרות. יש לרענן כדי לנסות שוב." : "Unable to load settings. Refresh to try again."}</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                {isDemo && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{demoMessage}</p>}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="growthRate">
                      {t.settings.annualGrowthRate}
                    </Label>
                    <Input
                      id="growthRate"
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
                  <Button type="submit" disabled={saving}>
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
            )}
          </DashboardSurface>
          {isDemo && <DashboardSurface>
            <h2 className="text-lg font-semibold">{locale === "he" ? "איפוס חשבון הדמו" : "Reset demo account"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{locale === "he" ? "מחיקת השינויים בחשבון הדמו המשותף במחשב וחזרה לנתוני ההדגמה ההתחלתיים." : "Remove changes from this computer’s shared demo account and restore the initial sample data."}</p>
            <Button type="button" variant="destructive" className="mt-4" onClick={() => setResetOpen(true)}>{locale === "he" ? "איפוס הדמו" : "Reset demo"}</Button>
            <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetting) setResetOpen(open); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{locale === "he" ? "לאפס את חשבון הדמו במחשב?" : "Reset this computer’s demo account?"}</DialogTitle>
                  <DialogDescription>{locale === "he" ? "כל העסקאות, ההחזקות, מקורות ההשקעה, רשימות המעקב וההגדרות בדמו יאופסו בכל הדפדפנים במחשב הזה. החשבון האישי לא ישתנה." : "All demo transactions, holdings, investment sources, watchlists and settings will reset across every browser on this computer. Your personal account will remain unchanged."}</DialogDescription>
                </DialogHeader>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" disabled={resetting} onClick={() => setResetOpen(false)}>{locale === "he" ? "ביטול" : "Cancel"}</Button>
                  <Button type="button" variant="destructive" disabled={resetting} onClick={() => { void handleResetDemo(); }}>{resetting ? (locale === "he" ? "מאפס…" : "Resetting…") : (locale === "he" ? "אישור איפוס הדמו" : "Confirm demo reset")}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </DashboardSurface>}
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
