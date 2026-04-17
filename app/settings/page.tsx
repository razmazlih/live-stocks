"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useApp } from "@/lib/context";
import { useTranslation } from "@/lib/translations";
import { isNasdaqTradingHours } from "@/lib/utils/trading-hours";
import { toast } from "@/lib/toast";
import {
  CircleDollarSign,
  Clock,
  KeyRound,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";

export default function SettingsPage() {
  const { locale, setLocale, settings, setSettings } = useApp();
  const { t } = useTranslation(locale);
  const [formData, setFormData] = useState(settings);
  const [saving, setSaving] = useState(false);

  const marketOpen = isNasdaqTradingHours();
  const isRtl = locale === "he";
  const minutesLabel = locale === "he" ? "דקות" : "minutes";
  const tokenConfigured = Boolean(formData.finnhubToken?.trim());

  const hasPendingChanges = useMemo(() => {
    return (
      formData.annualGrowthRate !== settings.annualGrowthRate ||
      formData.currency !== settings.currency ||
      formData.refreshInterval !== settings.refreshInterval ||
      (formData.finnhubToken ?? "") !== (settings.finnhubToken ?? "")
    );
  }, [formData, settings]);

  const headerMetaBadges = useMemo(
    () => [
      {
        key: "currency",
        icon: CircleDollarSign,
        label: `${t.settings.currency} · ${formData.currency}`,
        className: "bg-[color:var(--color-blue-50)] text-[var(--color-primary-700)]",
        iconClassName: "text-[var(--color-primary-500)]",
      },
      {
        key: "refresh",
        icon: RefreshCw,
        label: `${t.settings.refreshInterval} · ${formData.refreshInterval} ${minutesLabel}`,
        className: "bg-[color:var(--color-slate-50)] text-[var(--color-slate-600)]",
        iconClassName: "text-[var(--color-slate-500)]",
      },
      {
        key: "market",
        icon: Clock,
        label: marketOpen
          ? t.settings.refreshIntervalActive
          : t.settings.refreshIntervalInactive,
        className: marketOpen
          ? "bg-[color:var(--color-emerald-50)] text-[var(--color-emerald-600)]"
          : "bg-[color:var(--color-slate-100)] text-[var(--color-slate-600)]",
        iconClassName: marketOpen ? "text-[var(--color-emerald-500)]" : "text-[var(--color-slate-500)]",
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
          ? "bg-[color:var(--color-emerald-50)] text-[var(--color-emerald-600)]"
          : "bg-[color:var(--color-rose-50)] text-[var(--color-rose-600)]",
        iconClassName: tokenConfigured ? "text-[var(--color-emerald-500)]" : "text-[var(--color-rose-500)]",
      },
    ],
    [formData.currency, formData.refreshInterval, locale, marketOpen, minutesLabel, t.settings, tokenConfigured]
  );

  const readiness = useMemo(() => {
    if (hasPendingChanges) {
      return {
        tone: "warning" as const,
        title: locale === "he" ? "שינויים ממתינים" : "Unsaved changes",
        description:
          locale === "he"
            ? "הערכים עודכנו במסך, אבל לא נשמרו עדיין במסד הנתונים."
            : "The form has been edited, but the changes are not saved yet.",
      };
    }

    if (tokenConfigured) {
      return {
        tone: "positive" as const,
        title: locale === "he" ? "הגדרות מסונכרנות" : "Configuration in sync",
        description:
          locale === "he"
            ? "ההגדרות הנוכחיות תואמות למה ששמור במערכת."
            : "Current settings match the saved configuration.",
      };
    }

    return {
      tone: "neutral" as const,
      title: locale === "he" ? "הגדרות בסיסיות" : "Baseline configuration",
      description:
        locale === "he"
          ? "המערכת פעילה, אבל מפתח Finnhub עדיין לא הוגדר."
          : "The system is active, but a Finnhub token has not been added yet.",
    };
  }, [hasPendingChanges, locale, tokenConfigured]);

  const statusFacts = useMemo(
    () => [
      {
        label: locale === "he" ? "מצב השמירה" : "Save state",
        value: hasPendingChanges
          ? locale === "he"
            ? "שינויים ממתינים"
            : "Unsaved edits"
          : locale === "he"
            ? "מסונכרן"
            : "Synced",
      },
      {
        label: locale === "he" ? "מטבע" : "Currency",
        value: formData.currency,
      },
      {
        label: locale === "he" ? "קצב רענון" : "Refresh cadence",
        value: `${formData.refreshInterval} ${minutesLabel}`,
      },
    ],
    [formData.currency, formData.refreshInterval, hasPendingChanges, locale, minutesLabel]
  );

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("settings").select("*").maybeSingle();

      if (error) throw error;

      if (data) {
        const loadedSettings = {
          annualGrowthRate: parseFloat(data.annual_growth_rate.toString()),
          currency: data.currency as "USD" | "ILS",
          refreshInterval: data.refresh_interval,
          finnhubToken: data.finnhub_token || "",
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
    setSaving(true);

    try {
      const supabase = getSupabaseClient();
      const { data: existing } = await supabase.from("settings").select("id").maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({
            annual_growth_rate: formData.annualGrowthRate,
            currency: formData.currency,
            refresh_interval: formData.refreshInterval,
            finnhub_token: formData.finnhubToken,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert({
          annual_growth_rate: formData.annualGrowthRate,
          currency: formData.currency,
          refresh_interval: formData.refreshInterval,
          finnhub_token: formData.finnhubToken,
        });

        if (error) throw error;
      }

      setSettings(formData);
      toast.success(locale === "he" ? "ההגדרות נשמרו בהצלחה" : "Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(locale === "he" ? "שגיאה בשמירת ההגדרות" : "Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  function handleResetChanges() {
    setFormData((prev) => ({
      ...prev,
      annualGrowthRate: settings.annualGrowthRate,
      currency: settings.currency,
      refreshInterval: settings.refreshInterval,
      finnhubToken: settings.finnhubToken || "",
    }));
  }

  return (
    <DashboardPageShell direction={isRtl ? "rtl" : "ltr"}>
      <div className="dashboard-page-container rebuild-page-container overflow-x-clip">
        <div className="space-y-6">
          <header className="overflow-hidden rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 px-5 py-6 shadow-sm sm:px-6 sm:py-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  <SettingsIcon className="h-3.5 w-3.5" />
                  {locale === "he" ? "הגדרות מערכת" : "System settings"}
                </div>
                <h1 className="text-[clamp(2rem,7vw,3.5rem)] font-black tracking-tight text-[var(--color-primary-900)]">
                  {t.settings.title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                  {locale === "he"
                    ? "במסך הזה אתה מגדיר את ברירות המחדל של המערכת, את קצב העדכון ואת חיבור הנתונים. הכל נשאר מרוכז, קריא, וברור."
                    : "Set the system defaults, refresh cadence, and data connection in one place. Everything stays focused, readable, and explicit."}
                </p>
                <div className="flex flex-col gap-2 text-xs font-medium text-[var(--color-slate-600)] sm:flex-row sm:flex-wrap sm:items-center">
                  <span
                    className={cn(
                      "inline-flex w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left sm:w-auto",
                      readiness.tone === "positive"
                        ? "border-[color:var(--color-emerald-200)] bg-[color:var(--color-emerald-50)] text-[var(--color-emerald-700)]"
                        : readiness.tone === "warning"
                          ? "border-[color:var(--color-amber-200)] bg-[color:var(--color-amber-50)] text-[var(--color-amber-700)]"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] text-[var(--color-slate-600)]"
                    )}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{readiness.title}</span>
                  </span>
                  <span className="inline-flex w-full items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)] px-3 py-1.5 text-[var(--color-slate-600)] sm:w-auto">
                    <RefreshCw className="h-4 w-4 text-[var(--color-primary-500)]" />
                    <span className="min-w-0 break-words">
                      {t.settings.refreshInterval}: {formData.refreshInterval} {minutesLabel}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid gap-2 text-xs font-medium sm:grid-cols-2 2xl:grid-cols-4 2xl:max-w-none">
                {headerMetaBadges.map((badge) => {
                  const Icon = badge.icon;

                  return (
                    <span
                      key={badge.key}
                      className={cn(
                        "inline-flex min-h-11 w-full items-start gap-2 rounded-2xl border px-3 py-2 text-left",
                        badge.className
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", badge.iconClassName)} />
                      <span className="min-w-0 break-words leading-5">{badge.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </header>

          <main className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] xl:items-start">
            <Card className="overflow-hidden rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
              <CardHeader className="space-y-4 border-b border-[color:var(--color-slate-200)]/60 bg-[color:var(--color-slate-50)]/70 px-5 py-6 sm:px-7">
                <div className="flex flex-col gap-2">
                  <CardDescription className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
                    {locale === "he" ? "העדפות ליבה" : "Core preferences"}
                  </CardDescription>
                  <CardTitle className="text-[clamp(1.45rem,5vw,2rem)] font-black tracking-tight text-[var(--color-primary-900)]">
                    {locale === "he" ? "הגדרות אישיות ומסחריות" : "Personal and market defaults"}
                  </CardTitle>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-[var(--color-slate-600)]">
                  {locale === "he"
                    ? "כאן מגדירים את ברירות המחדל שמלוות את כל החוויה: שפה, מטבע, קצב רענון, וחיבור Finnhub."
                    : "Define the defaults that shape the whole experience: language, currency, refresh cadence, and Finnhub access."}
                </p>
              </CardHeader>

              <CardContent className="space-y-8 px-5 py-6 sm:px-7 sm:py-7">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <fieldset className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-slate-50)]/80 p-4 sm:p-5">
                    <legend className="px-2 text-sm font-semibold text-[var(--color-primary-900)]">
                      {locale === "he" ? "ברירות מחדל של התיק" : "Portfolio defaults"}
                    </legend>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="growthRate">{t.settings.annualGrowthRate}</Label>
                        <Input
                          id="growthRate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          inputMode="decimal"
                          aria-describedby="growthRate-help"
                          value={formData.annualGrowthRate}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              annualGrowthRate: parseFloat(e.target.value),
                            })
                          }
                        />
                        <p id="growthRate-help" className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {locale === "he"
                            ? "ערך בין 0 ל-1, למשל 0.05 עבור 5%."
                            : "Value between 0 and 1, for example 0.05 for 5%."}
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
                        <p id="currency-help" className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {locale === "he"
                            ? "ברירת המחדל המשפיעה על ההצגה של סכומים."
                            : "This sets the default display currency for monetary values."}
                        </p>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-neutral-white)]/90 p-4 sm:p-5">
                    <legend className="px-2 text-sm font-semibold text-[var(--color-primary-900)]">
                      {locale === "he" ? "שפה וקצב עדכון" : "Language and refresh cadence"}
                    </legend>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="refreshInterval">{t.settings.refreshInterval}</Label>
                        <Input
                          id="refreshInterval"
                          type="number"
                          value={formData.refreshInterval}
                          readOnly
                          disabled
                          aria-describedby="refreshInterval-help"
                        />
                        <p id="refreshInterval-help" className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {t.settings.refreshIntervalDescription}
                        </p>
                        <p
                          className={cn(
                            "text-xs leading-5 font-medium",
                            marketOpen ? "text-[var(--color-emerald-600)]" : "text-[var(--color-slate-500)]"
                          )}
                        >
                          {marketOpen ? t.settings.refreshIntervalActive : t.settings.refreshIntervalInactive}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="language">{locale === "he" ? "שפה" : "Language"}</Label>
                        <Select value={locale} onValueChange={(value) => setLocale(value as "he" | "en")}>
                          <SelectTrigger id="language">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="he">עברית</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                          </SelectContent>
                        </Select>
                        <p id="language-help" className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {locale === "he"
                            ? "השינוי יחול מיד על הממשק והכיווניות."
                            : "The change applies immediately to the interface and direction."}
                        </p>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/70 p-4 sm:p-5">
                    <legend className="px-2 text-sm font-semibold text-[var(--color-primary-900)]">
                      {locale === "he" ? "חיבור נתונים" : "Data connection"}
                    </legend>
                    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
                      <div className="space-y-2">
                        <Label htmlFor="finnhubToken">{t.settings.finnhubToken}</Label>
                        <Input
                          id="finnhubToken"
                          type="password"
                          value={formData.finnhubToken}
                          onChange={(e) =>
                            setFormData({ ...formData, finnhubToken: e.target.value })
                          }
                          placeholder="Enter your Finnhub API token"
                          aria-describedby="finnhubToken-help"
                        />
                        <p id="finnhubToken-help" className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {locale === "he" ? "ניתן להשיג מפתח בחינם מ-" : "Get a free token from "}
                          <a
                            href="https://finnhub.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[var(--color-primary-700)] underline-offset-4 hover:underline"
                          >
                            finnhub.io
                          </a>
                        </p>
                      </div>

                      <div className="rounded-[1.5rem] border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]/90 p-4 text-sm text-[var(--color-slate-600)]">
                        <p className="font-semibold text-[var(--color-primary-900)]">
                          {locale === "he" ? "מה נשמר כאן" : "What stays saved"}
                        </p>
                        <ul className="mt-3 space-y-2 leading-6">
                          <li>{locale === "he" ? "שפה וכיווניות" : "Language and layout direction"}</li>
                          <li>{locale === "he" ? "מטבע ברירת מחדל" : "Default currency"}</li>
                          <li>{locale === "he" ? "העדפות רענון" : "Refresh preferences"}</li>
                          <li>{locale === "he" ? "מפתח Finnhub אישי" : "Personal Finnhub token"}</li>
                        </ul>
                      </div>
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-3 border-t border-[color:var(--color-slate-200)]/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                      {locale === "he"
                        ? "השינויים נשמרים למסד הנתונים בלבד לאחר לחיצה על Save."
                        : "Changes are only written to the database after you press Save."}
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleResetChanges}
                        className="rounded-full border-[color:var(--color-slate-200)] px-5"
                      >
                        {locale === "he" ? "אפס שינויים" : "Reset changes"}
                      </Button>
                      <Button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-[var(--color-primary-600)] px-5 text-white shadow-sm hover:bg-[var(--color-primary-700)]"
                      >
                        {saving ? (locale === "he" ? "שומר..." : "Saving...") : t.settings.save}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <aside className="space-y-4">
              <Card className="overflow-hidden rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
                <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)]/60 bg-[color:var(--color-slate-50)]/70 px-5 py-6">
                  <CardDescription className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
                    {locale === "he" ? "בדיקת מצב" : "Status check"}
                  </CardDescription>
                  <CardTitle className="text-xl font-black tracking-tight text-[var(--color-primary-900)]">
                    {readiness.title}
                  </CardTitle>
                  <p className="text-sm leading-6 text-[var(--color-slate-600)]">{readiness.description}</p>
                </CardHeader>

                <CardContent className="space-y-4 px-5 py-5">
                  <div
                    className={cn(
                      "rounded-[1.25rem] border px-4 py-4",
                      readiness.tone === "positive"
                        ? "border-[color:var(--color-emerald-200)] bg-[color:var(--color-emerald-50)]/85"
                        : readiness.tone === "warning"
                          ? "border-[color:var(--color-amber-200)] bg-[color:var(--color-amber-50)]/85"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/85"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                          readiness.tone === "positive"
                            ? "bg-[color:var(--color-emerald-100)] text-[var(--color-emerald-700)]"
                            : readiness.tone === "warning"
                              ? "bg-[color:var(--color-amber-100)] text-[var(--color-amber-700)]"
                              : "bg-[color:var(--color-slate-100)] text-[var(--color-slate-600)]"
                        )}
                      >
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-primary-900)]">
                          {locale === "he" ? "מוכנות המערכת" : "System readiness"}
                        </p>
                        <p className="text-sm leading-5 text-[var(--color-slate-600)]">{readiness.title}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {statusFacts.map((fact) => (
                      <div
                        key={fact.label}
                        className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/85 px-4 py-3"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {fact.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--color-primary-900)]">
                          {fact.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-3">
                      <span className="text-[var(--color-slate-500)]">{t.settings.currency}</span>
                      <span className="font-semibold text-[var(--color-primary-900)]">{formData.currency}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-3">
                      <span className="text-[var(--color-slate-500)]">{t.settings.refreshInterval}</span>
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {formData.refreshInterval} {minutesLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-3">
                      <span className="text-[var(--color-slate-500)]">{t.settings.finnhubToken}</span>
                      <span
                        className={cn(
                          "font-semibold",
                          tokenConfigured ? "text-[var(--color-emerald-600)]" : "text-[var(--color-rose-600)]"
                        )}
                      >
                        {tokenConfigured
                          ? locale === "he"
                            ? "מחובר"
                            : "Connected"
                          : locale === "he"
                            ? "חסר"
                            : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-3">
                      <span className="text-[var(--color-slate-500)]">
                        {locale === "he" ? "שפה" : "Language"}
                      </span>
                      <span className="font-semibold text-[var(--color-primary-900)]">
                        {locale === "he" ? "עברית" : "English"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/90 px-4 py-4 text-sm leading-6 text-[var(--color-slate-600)]">
                    <p className="font-semibold text-[var(--color-primary-900)]">
                      {locale === "he" ? "רמז לתפעול" : "Operational note"}
                    </p>
                    <p className="mt-2">
                      {locale === "he"
                        ? "אם אתה משנה שפה או מפתח, הכרטיס למעלה יעבור מיד למצב מעודכן כדי שתדע אם נשארו שינויים לא שמורים."
                        : "When you change language or token state, the readiness card updates immediately so you can see whether anything still needs saving."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </main>
        </div>
      </div>
    </DashboardPageShell>
  );
}
