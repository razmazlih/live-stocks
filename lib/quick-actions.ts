export const QUICK_ACTION_FOCUS_CLASSES =
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export const QUICK_ACTION_COLORS = {
  refresh: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#6366F1] text-white shadow-sm hover:bg-[#4F46E5] focus-visible:ring-[#4338CA]`,
  home: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8] focus-visible:ring-[#1E40AF]`,
  portfolio: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF] focus-visible:ring-[#1E3A8A]`,
  realized: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7] focus-visible:ring-[#0EA5E9]`,
  positions: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#22C55E] text-white shadow-sm hover:bg-[#16A34A] focus-visible:ring-[#15803D]`,
  settings: `${QUICK_ACTION_FOCUS_CLASSES} bg-[#F97316] text-white shadow-sm hover:bg-[#EA580C] focus-visible:ring-[#C2410C]`,
} as const;

type QuickActionColorKey = keyof typeof QUICK_ACTION_COLORS;

export const getQuickActionClasses = (key: QuickActionColorKey) => QUICK_ACTION_COLORS[key];
