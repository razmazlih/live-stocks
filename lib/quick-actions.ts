import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { cn } from '@/lib/utils';

export type QuickActionKey = 'reload' | 'home' | 'portfolio' | 'realized' | 'positions' | 'settings';

type QuickActionPreset = Partial<
  Pick<DashboardQuickAction, 'variant' | 'className' | 'iconClassName' | 'labelClassName'>
>;

const quickActionPresets: Record<QuickActionKey, QuickActionPreset> = {
  reload: {
    variant: 'outline',
    className:
      'border border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/60',
    iconClassName: 'text-slate-500',
    labelClassName: 'hidden sm:inline',
  },
  home: {
    variant: 'default',
    className: 'bg-[#6366F1] text-white shadow-sm hover:bg-[#4F46E5] focus-visible:ring-[#C7D2FE]',
  },
  portfolio: {
    variant: 'default',
    className: 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF] focus-visible:ring-[#93C5FD]',
  },
  realized: {
    variant: 'default',
    className: 'bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7] focus-visible:ring-[#BAE6FD]',
  },
  positions: {
    variant: 'default',
    className: 'bg-[#16A34A] text-white shadow-sm hover:bg-[#15803D] focus-visible:ring-[#86EFAC]',
  },
  settings: {
    variant: 'default',
    className: 'bg-[#FBBF24] text-slate-900 shadow-sm hover:bg-[#F59E0B] focus-visible:ring-[#FDE68A]',
    labelClassName: 'hidden sm:inline',
  },
};

export function buildQuickAction<K extends QuickActionKey>(
  key: K,
  action: Omit<DashboardQuickAction, 'key'>
): DashboardQuickAction {
  const preset = quickActionPresets[key];

  return {
    key,
    ...preset,
    ...action,
    className: cn(preset.className, action.className),
    iconClassName: cn(preset.iconClassName, action.iconClassName),
    labelClassName: cn(preset.labelClassName, action.labelClassName),
  };
}
