import { useMemo } from 'react';

import { DashboardQuickActions } from './quick-actions';
import { createCommonQuickActions, type AppTranslation } from './quick-actions-presets';

interface QuickActionsPanelProps {
  title: string;
  t: AppTranslation;
  reload?: () => void;
  loading?: boolean;
  refreshing?: boolean;
}

export function QuickActionsPanel({ title, t, reload, loading, refreshing }: QuickActionsPanelProps) {
  const actions = useMemo(
    () => createCommonQuickActions({ t, reload, loading, refreshing }),
    [t, reload, loading, refreshing]
  );

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <DashboardQuickActions actions={actions} />
    </div>
  );
}
