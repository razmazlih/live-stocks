'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveDemoPreferences } from '@/lib/demo/client';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/components/theme-provider';
import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function AppearanceSettings({ locale, demo = false }: { locale: 'he' | 'en'; demo?: boolean }) {
  const he = locale === 'he';
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const { reduceTransparency, systemReducesTransparency, ready, setReduceTransparency } = useAppearance();
  const options: { value: string; label: string; icon: LucideIcon }[] = [
    { value: 'system', label: he ? 'לפי המכשיר' : 'System', icon: Monitor },
    { value: 'light', label: he ? 'בהיר' : 'Light', icon: Sun },
    { value: 'dark', label: he ? 'כהה' : 'Dark', icon: Moon },
  ];

  async function updateTheme(value: 'light' | 'dark' | 'system') {
    setSaving(true);
    try { if (demo) await saveDemoPreferences({ theme: value }); setTheme(value); }
    catch { toast.error(he ? 'לא ניתן לשמור את מראה הדמו במחשב' : 'Could not save the demo appearance on this computer'); }
    finally { setSaving(false); }
  }
  async function updateTransparency(value: boolean) {
    setSaving(true);
    try { if (demo) await saveDemoPreferences({ reduceTransparency: value }); setReduceTransparency(value); }
    catch { toast.error(he ? 'לא ניתן לשמור את מראה הדמו במחשב' : 'Could not save the demo appearance on this computer'); }
    finally { setSaving(false); }
  }

  return <DashboardSurface>
    <h2 id="appearance-title" className="text-lg font-semibold text-slate-950">{he ? 'מראה' : 'Appearance'}</h2>
    <p className="mt-1 text-sm text-slate-500">{he ? 'השינויים נשמרים אוטומטית במכשיר הזה.' : 'Changes are saved automatically on this device.'}</p>
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-medium text-slate-700">{he ? 'ערכת צבעים' : 'Color scheme'}</legend>
      <div className="grid max-w-lg grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon }) => <label key={value} className={cn('relative flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-blue-500', ready && theme === value ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
          <input type="radio" name="appearance-theme" value={value} checked={ready && theme === value} onChange={() => { void updateTheme(value as 'light' | 'dark' | 'system'); }} disabled={!ready || saving} className="sr-only" />
          <Icon aria-hidden className="h-5 w-5" />{label}
        </label>)}
      </div>
    </fieldset>
    <div className="mt-5 flex items-center justify-between gap-5 border-t border-slate-100 pt-5">
      <div>
        <label htmlFor="reduce-transparency" className="cursor-pointer text-sm font-medium text-slate-700">{he ? 'הפחתת שקיפות' : 'Reduce transparency'}</label>
        <p id="transparency-description" className="mt-1 text-xs leading-relaxed text-slate-500">{systemReducesTransparency ? he ? 'פעיל לפי הגדרת הנגישות במכשיר.' : 'Enabled by your device accessibility setting.' : he ? 'משטחים אטומים יותר לקריאה נוחה וברורה.' : 'More opaque surfaces for clearer, comfortable reading.'}</p>
      </div>
      <Switch id="reduce-transparency" checked={reduceTransparency || systemReducesTransparency} onCheckedChange={(value) => { void updateTransparency(value); }} disabled={!ready || saving || systemReducesTransparency} aria-describedby="transparency-description" />
    </div>
  </DashboardSurface>;
}
