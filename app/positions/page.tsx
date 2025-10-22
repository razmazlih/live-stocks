'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { Position, PositionLot, PositionLotType, PositionPlan } from '@/types';
import { mapPositionPlanRow, mapPositionRow } from '@/lib/positions';
import { formatCurrency, formatDate, formatNumber } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  ArrowRightLeft,
  History,
  CalendarPlus,
  Ban,
  Layers,
  Package,
  CalendarClock,
  GitBranch,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface PositionFormData {
  symbol: string;
  display: string;
  imageUrl: string;
  initialPrice: number;
  initialQuantity: number;
  initialDate: string;
  targetPrice: number;
  targetQuantity: number;
  targetDate: string;
}

interface TransactionFormData {
  id?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
}

type NewPositionMode = 'immediate' | 'plan';

interface PlanFormData {
  id?: string;
  positionId?: string | null;
  symbol: string;
  display: string;
  imageUrl: string;
  side: PositionPlan['side'];
  targetPrice: number;
  targetQuantity: number;
  targetDate: string;
}

function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function createDefaultTransactionForm(): TransactionFormData {
  return {
    type: 'BUY',
    price: 0,
    quantity: 0,
    executedAt: getTodayIsoDate(),
  };
}

function createDefaultPlanForm(overrides: Partial<PlanFormData> = {}): PlanFormData {
  return {
    symbol: '',
    display: '',
    imageUrl: '',
    side: 'buy',
    targetPrice: 0,
    targetQuantity: 0,
    targetDate: getTodayIsoDate(),
    ...overrides,
  };
}

export default function PositionsPage() {
  const { locale, triggerRefresh, processPlans, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
  const [unassignedPlans, setUnassignedPlans] = useState<PositionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<PositionFormData>({
    symbol: '',
    display: '',
    imageUrl: '',
    initialPrice: 0,
    initialQuantity: 0,
    initialDate: getTodayIsoDate(),
    targetPrice: 0,
    targetQuantity: 0,
    targetDate: getTodayIsoDate(),
  });
  const [newPositionMode, setNewPositionMode] = useState<NewPositionMode>('immediate');
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionTarget, setTransactionTarget] = useState<Position | null>(null);
  const [transactionForm, setTransactionForm] = useState<TransactionFormData>(createDefaultTransactionForm());
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormData>(createDefaultPlanForm());
  const [planContextPosition, setPlanContextPosition] = useState<Position | null>(null);
  const isEditing = Boolean(editingPosition);
  const isEditingTransaction = Boolean(transactionForm.id);
  const isEditingPlan = Boolean(planForm.id);
  const planStatusLabels: Record<PositionPlan['status'], string> = {
    pending: t.positions.planStatusPending,
    triggered: t.positions.planStatusTriggered,
    expired: t.positions.planStatusExpired,
    cancelled: t.positions.planStatusCancelled,
  };
  const planStatusClasses: Record<PositionPlan['status'], string> = {
    pending: 'bg-sky-100 text-sky-700',
    triggered: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-slate-200 text-slate-600',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  const canSelectSell = Boolean(planContextPosition?.id ?? planForm.positionId);

  const historyTarget = useMemo(() => {
    if (!historyTargetId) {
      return null;
    }
    return positions.find((position) => position.id === historyTargetId) ?? null;
  }, [historyTargetId, positions]);

  const planRecords = useMemo(
    () => [
      ...positions.flatMap((position) =>
        (position.plans ?? []).map((plan) => ({ plan, position })),
      ),
      ...unassignedPlans.map((plan) => ({ plan, position: null as Position | null })),
    ],
    [positions, unassignedPlans],
  );

  const activePlans = useMemo(
    () =>
      planRecords.filter(
        ({ plan }) => plan.status !== 'expired' && plan.status !== 'cancelled',
      ),
    [planRecords],
  );

  const activeLinkedPlans = useMemo(
    () => activePlans.filter(({ position }) => Boolean(position)),
    [activePlans],
  );

  const activeDetachedPlans = useMemo(
    () => activePlans.filter(({ position }) => !position),
    [activePlans],
  );

  const closedPlans = useMemo(
    () => planRecords.filter(({ plan }) => plan.status === 'expired' || plan.status === 'cancelled'),
    [planRecords],
  );

  const totalQuantity = useMemo(
    () =>
      positions.reduce(
        (sum, position) => sum + (Number.isFinite(position.quantity) ? position.quantity : 0),
        0,
      ),
    [positions],
  );

  const pendingPlansCount = useMemo(
    () => activePlans.filter(({ plan }) => plan.status === 'pending').length,
    [activePlans],
  );

  const triggeredPlansCount = useMemo(
    () => activePlans.filter(({ plan }) => plan.status === 'triggered').length,
    [activePlans],
  );

  const overviewStats = [
    {
      key: 'positions',
      label: t.positions.overviewActivePositions,
      value: formatNumber(positions.length, locale),
      icon: Layers,
    },
    {
      key: 'quantity',
      label: t.positions.overviewTotalQuantity,
      value: formatNumber(totalQuantity, locale),
      icon: Package,
    },
    {
      key: 'pending-plans',
      label: t.positions.overviewPendingPlans,
      value: formatNumber(pendingPlansCount, locale),
      icon: CalendarClock,
    },
    {
      key: 'detached-plans',
      label: t.positions.overviewDetachedPlans,
      value: formatNumber(activeDetachedPlans.length, locale),
      icon: GitBranch,
    },
  ];

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const [positionsResult, unattachedPlansResult] = await Promise.all([
        supabase
          .from('positions')
          .select('*, position_lots(*), position_plans(*)')
          .order('symbol'),
        supabase
          .from('position_plans')
          .select('*')
          .is('position_id', null)
          .order('target_date', { ascending: true }),
      ]);

      if (positionsResult.error) throw positionsResult.error;
      if (unattachedPlansResult.error) throw unattachedPlansResult.error;

      const mappedPositions: Position[] = (positionsResult.data || []).map(mapPositionRow);
      const mappedUnassignedPlans: PositionPlan[] = (unattachedPlansResult.data || []).map(
        mapPositionPlanRow,
      );

      setPositions(mappedPositions);
      setUnassignedPlans(mappedUnassignedPlans);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast.error(t.common.error);
    } finally {
      setLoading(false);
    }
  }, [t.common.error]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions, refreshTrigger]);

  function openAddDialog() {
    setEditingPosition(null);
    setNewPositionMode('immediate');
    setFormData({
      symbol: '',
      display: '',
      imageUrl: '',
      initialPrice: 0,
      initialQuantity: 0,
      initialDate: getTodayIsoDate(),
      targetPrice: 0,
      targetQuantity: 0,
      targetDate: getTodayIsoDate(),
    });
    setDialogOpen(true);
  }

  function openEditDialog(position: Position) {
    setEditingPosition(position);
    setNewPositionMode('immediate');
    setFormData({
      symbol: position.symbol,
      display: position.display,
      imageUrl: position.imageUrl,
      initialPrice: position.entryPrice,
      initialQuantity: position.quantity,
      initialDate: position.entryDate,
      targetPrice: 0,
      targetQuantity: 0,
      targetDate: getTodayIsoDate(),
    });
    setDialogOpen(true);
  }

  function openTransactionDialog(position: Position, type: PositionLotType = 'BUY') {
    setTransactionTarget(position);
    setTransactionForm({
      ...createDefaultTransactionForm(),
      type,
    });
    setTransactionDialogOpen(true);
  }

  function openEditTransactionDialog(position: Position, lot: PositionLot) {
    setHistoryDialogOpen(false);
    setTransactionTarget(position);
    setTransactionForm({
      id: lot.id,
      type: lot.type,
      price: lot.price,
      quantity: lot.quantity,
      executedAt: lot.executedAt,
    });
    setTransactionDialogOpen(true);
  }

  function openHistoryDialog(position: Position) {
    setHistoryTargetId(position.id ?? null);
    setHistoryDialogOpen(true);
  }

  function openPlanDialogForPosition(position: Position) {
    if (!position.id) {
      return;
    }
    setPlanContextPosition(position);
    setPlanForm(
      createDefaultPlanForm({
        positionId: position.id,
        symbol: position.symbol,
        display: position.display,
        imageUrl: position.imageUrl,
        side: 'buy',
      }),
    );
    setPlanDialogOpen(true);
  }

  function openDetachedPlanDialog() {
    setPlanContextPosition(null);
    setPlanForm(createDefaultPlanForm());
    setPlanDialogOpen(true);
  }

  function openEditPlanDialog(plan: PositionPlan, position: Position | null = null) {
    if (plan.status !== 'pending') {
      return;
    }

    setPlanContextPosition(position ?? null);
    setPlanForm({
      id: plan.id,
      positionId: plan.positionId ?? null,
      symbol: plan.symbol,
      display: plan.display ?? '',
      imageUrl: plan.imageUrl ?? '',
      side: plan.side,
      targetPrice: plan.targetPrice,
      targetQuantity: plan.targetQuantity,
      targetDate: plan.targetDate,
    });
    setPlanDialogOpen(true);
  }

  const handlePlanDialogOpenChange = useCallback((open: boolean) => {
    setPlanDialogOpen(open);
    if (!open) {
      setPlanContextPosition(null);
      setPlanForm(createDefaultPlanForm());
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.symbol || !formData.display) {
      toast.error(locale === 'he' ? 'נא למלא את כל השדות' : 'Please fill all fields');
      return;
    }

    if (!editingPosition) {
      if (newPositionMode === 'immediate') {
        if (formData.initialPrice <= 0 || formData.initialQuantity <= 0) {
          toast.error(
            locale === 'he'
              ? 'נדרש מחיר וכמות חיוביים לכניסה'
              : 'Positive price and quantity are required',
          );
          return;
        }
      } else {
        if (formData.targetPrice <= 0 || formData.targetQuantity <= 0) {
          toast.error(t.positions.planValidationError);
          return;
        }
      }
    }

    try {
      if (editingPosition) {
        const { error } = await supabase
          .from('positions')
          .update({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl || `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPosition.id);

        if (error) throw error;
        toast.success(locale === 'he' ? 'הפרטים עודכנו' : 'Position details updated');
      } else if (newPositionMode === 'immediate') {
        const { data, error } = await supabase
          .from('positions')
          .insert({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl || `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
            entry_price: formData.initialPrice,
            quantity: formData.initialQuantity,
            entry_date: formData.initialDate,
          })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          const { error: lotError } = await supabase.from('position_lots').insert({
            position_id: data.id,
            side: 'BUY',
            price: formData.initialPrice,
            quantity: formData.initialQuantity,
            executed_at: formData.initialDate,
          });

          if (lotError) throw lotError;
        }

        toast.success(locale === 'he' ? 'הפוזיציה נוספה' : 'Position added');
      } else {
        const { error } = await supabase.from('position_plans').insert({
          position_id: null,
          symbol: formData.symbol,
          display: formData.display,
          image_url: formData.imageUrl || `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
          side: 'buy',
          target_price: formData.targetPrice,
          target_quantity: formData.targetQuantity,
          target_date: formData.targetDate,
        });

        if (error) throw error;

        toast.success(t.positions.planSaved);
      }

      setDialogOpen(false);
      setNewPositionMode('immediate');
      loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error('Error saving position:', error);
      toast.error(t.common.error);
    }
  }

  async function handleTransactionSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!transactionTarget?.id) {
      toast.error(t.common.error);
      return;
    }

    if (transactionForm.price <= 0 || transactionForm.quantity <= 0) {
      toast.error(locale === 'he' ? 'נא להזין מחיר וכמות חיוביים' : 'Enter positive price and quantity');
      return;
    }

    if (!transactionForm.id && transactionForm.type === 'SELL' && transactionForm.quantity > transactionTarget.quantity) {
      toast.error(locale === 'he' ? 'אין מספיק כמות פנויה למכירה' : 'Not enough quantity to sell');
      return;
    }

    try {
      if (transactionForm.id) {
        const { error } = await supabase
          .from('position_lots')
          .update({
            side: transactionForm.type,
            price: transactionForm.price,
            quantity: transactionForm.quantity,
            executed_at: transactionForm.executedAt,
          })
          .eq('id', transactionForm.id);

        if (error) throw error;

        toast.success(t.positions.transactionUpdated);
      } else {
        const { error } = await supabase.from('position_lots').insert({
          position_id: transactionTarget.id,
          side: transactionForm.type,
          price: transactionForm.price,
          quantity: transactionForm.quantity,
          executed_at: transactionForm.executedAt,
        });

        if (error) throw error;

        toast.success(t.positions.transactionSaved);
      }

      setTransactionDialogOpen(false);
      loadPositions();
      triggerRefresh();
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error(t.common.error);
    }
  }

  async function handleDeleteTransaction(lot: PositionLot) {
    if (!lot.id) {
      toast.error(t.common.error);
      return;
    }

    if (!confirm(t.positions.confirmDeleteTransaction)) {
      return;
    }

    try {
      const { error } = await supabase.from('position_lots').delete().eq('id', lot.id);

      if (error) throw error;

      toast.success(t.positions.transactionDeleted);
      await loadPositions();
      triggerRefresh();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast.error(t.common.error);
    }
  }

  async function handlePlanSubmit(e: React.FormEvent) {
    e.preventDefault();

    const symbol = planForm.symbol.trim().toUpperCase();
    const display = planForm.display.trim() || planContextPosition?.display || symbol;
    const imageUrl =
      planForm.imageUrl.trim() ||
      planContextPosition?.imageUrl ||
      `https://logo.clearbit.com/${symbol.toLowerCase()}.com`;
    const side = planForm.side;
    const targetPrice = Number.isFinite(planForm.targetPrice) ? planForm.targetPrice : 0;
    const targetQuantity = Number.isFinite(planForm.targetQuantity) ? planForm.targetQuantity : 0;
    const targetDate = planForm.targetDate;

    if (!symbol || targetPrice <= 0 || targetQuantity <= 0 || !targetDate) {
      toast.error(t.positions.planValidationError);
      return;
    }

    const positionId = planContextPosition?.id ?? planForm.positionId ?? null;

    if (side === 'sell' && !positionId) {
      toast.error(t.positions.planSellDetachedError);
      return;
    }

    try {
      if (isEditingPlan && planForm.id) {
        const { error } = await supabase
          .from('position_plans')
          .update({
            symbol,
            display,
            image_url: imageUrl,
            side,
            target_price: targetPrice,
            target_quantity: targetQuantity,
            target_date: targetDate,
            position_id: positionId,
          })
          .eq('id', planForm.id);

        if (error) throw error;
        toast.success(t.positions.planUpdated);
      } else {
        const { error } = await supabase.from('position_plans').insert({
          symbol,
          display,
          image_url: imageUrl,
          side,
          target_price: targetPrice,
          target_quantity: targetQuantity,
          target_date: targetDate,
          position_id: positionId,
        });

        if (error) throw error;
        toast.success(t.positions.planSaved);
      }

      handlePlanDialogOpenChange(false);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error(t.common.error);
    }
  }

  async function handlePlanCancel(plan: PositionPlan) {
    if (!plan.id) {
      toast.error(t.common.error);
      return;
    }

    if (!confirm(t.positions.planCancelConfirm)) {
      return;
    }

    const today = getTodayIsoDate();

    try {
      const { error } = await supabase
        .from('position_plans')
        .update({ status: 'cancelled', expired_at: today })
        .eq('id', plan.id);

      if (error) throw error;

      toast.success(t.positions.planCancelled);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error('Error cancelling plan:', error);
      toast.error(t.common.error);
    }
  }

  async function handlePlanDelete(plan: PositionPlan) {
    if (!plan.id) {
      toast.error(t.common.error);
      return;
    }

    if (!confirm(t.positions.planDeleteConfirm)) {
      return;
    }

    try {
      const { error } = await supabase.from('position_plans').delete().eq('id', plan.id);

      if (error) throw error;

      toast.success(t.positions.planDeleted);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error(t.common.error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(locale === 'he' ? 'האם למחוק פוזיציה זו?' : 'Delete this position?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('positions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(locale === 'he' ? 'הפוזיציה נמחקה' : 'Position deleted');
      loadPositions();
      triggerRefresh();
    } catch (error) {
      console.error('Error deleting position:', error);
      toast.error(t.common.error);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:py-12">
        <header className="mb-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-800">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {locale === 'he' ? 'חזרה' : 'Back'}
              </Button>
            </Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog} className="gap-2 shadow-sm">
                  <Plus className="h-4 w-4" />
                  {t.positions.add}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingPosition ? t.positions.edit : t.positions.add}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <Label htmlFor="symbol">{t.positions.symbol}</Label>
                      <Input
                        id="symbol"
                        value={formData.symbol}
                        onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                        placeholder="AAPL"
                        required
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Label htmlFor="display">{t.positions.display}</Label>
                      <Input
                        id="display"
                        value={formData.display}
                        onChange={(e) => setFormData({ ...formData, display: e.target.value })}
                        placeholder="Apple Inc."
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="imageUrl">{t.positions.imageUrl}</Label>
                    <Input
                      id="imageUrl"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                      placeholder="https://logo.clearbit.com/apple.com"
                    />
                  </div>
                  {isEditing && editingPosition ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-700">{t.positions.currentHolding}</p>
                      <p className="mt-2">
                        {formatNumber(editingPosition.quantity, locale)} · {formatCurrency(editingPosition.entryPrice, 'USD', locale)} • {formatDate(editingPosition.entryDate, locale)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.positions.since} {formatDate(editingPosition.entryDate, locale)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label>{t.positions.planModeLabel}</Label>
                        <RadioGroup
                          value={newPositionMode}
                          onValueChange={(value) => setNewPositionMode(value as NewPositionMode)}
                          className="mt-2 grid gap-2 sm:grid-cols-2"
                        >
                          <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-600">
                            <RadioGroupItem value="immediate" id="position-mode-immediate" className="order-[-1]" />
                            <span className="font-semibold text-slate-700">{t.positions.planModeImmediate}</span>
                            <span className="text-xs text-slate-500">{t.positions.planModeImmediateDescription}</span>
                          </label>
                          <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-600">
                            <RadioGroupItem value="plan" id="position-mode-plan" className="order-[-1]" />
                            <span className="font-semibold text-slate-700">{t.positions.planModePlan}</span>
                            <span className="text-xs text-slate-500">{t.positions.planModePlanDescription}</span>
                          </label>
                        </RadioGroup>
                      </div>
                      {newPositionMode === 'immediate' ? (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="sm:col-span-1">
                            <Label htmlFor="initialPrice">{t.positions.initialPrice}</Label>
                            <Input
                              id="initialPrice"
                              type="number"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(formData.initialPrice) ? formData.initialPrice : 0}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  initialPrice: Number.parseFloat(e.target.value) || 0,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <Label htmlFor="initialQuantity">{t.positions.initialQuantity}</Label>
                            <Input
                              id="initialQuantity"
                              type="number"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(formData.initialQuantity) ? formData.initialQuantity : 0}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  initialQuantity: Number.parseFloat(e.target.value) || 0,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <Label htmlFor="initialDate">{t.positions.initialDate}</Label>
                            <Input
                              id="initialDate"
                              type="date"
                              value={formData.initialDate}
                              onChange={(e) => setFormData({ ...formData, initialDate: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="sm:col-span-1">
                            <Label htmlFor="targetPrice">{t.positions.planTargetPrice}</Label>
                            <Input
                              id="targetPrice"
                              type="number"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(formData.targetPrice) ? formData.targetPrice : 0}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  targetPrice: Number.parseFloat(e.target.value) || 0,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <Label htmlFor="targetQuantity">{t.positions.planTargetQuantity}</Label>
                            <Input
                              id="targetQuantity"
                              type="number"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(formData.targetQuantity) ? formData.targetQuantity : 0}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  targetQuantity: Number.parseFloat(e.target.value) || 0,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <Label htmlFor="targetDate">{t.positions.planTargetDate}</Label>
                            <Input
                              id="targetDate"
                              type="date"
                              value={formData.targetDate}
                              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit">{t.positions.save}</Button>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      {t.positions.cancel}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-[#0F172A]">{t.positions.title}</h1>
            <p className="max-w-2xl text-sm text-slate-600">{t.positions.subtitle}</p>
          </div>
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.positions.overviewTitle}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t.positions.overviewDescription}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewStats.map(({ key, label, value, icon: Icon }) => (
                <Card key={key} className="border-none bg-white/90 shadow-inner">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="text-lg font-semibold text-slate-900">{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </header>

        <Dialog
          open={transactionDialogOpen}
          onOpenChange={(open) => {
            setTransactionDialogOpen(open);
            if (!open) {
              setTransactionTarget(null);
              setTransactionForm(createDefaultTransactionForm());
            }
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {isEditingTransaction ? t.positions.editTransaction : t.positions.addTransaction}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <Label>{t.positions.transactionType}</Label>
                <RadioGroup
                  value={transactionForm.type}
                  onValueChange={(value) =>
                    setTransactionForm({ ...transactionForm, type: value as PositionLotType })
                  }
                  className="mt-2 flex gap-4"
                >
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <RadioGroupItem value="BUY" id="transaction-buy" />
                    {t.positions.buy}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <RadioGroupItem value="SELL" id="transaction-sell" />
                    {t.positions.sell}
                  </label>
                </RadioGroup>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="transactionPrice">{t.positions.transactionPrice}</Label>
                  <Input
                    id="transactionPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={transactionForm.price}
                    onChange={(e) =>
                      setTransactionForm({
                        ...transactionForm,
                        price: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="transactionQuantity">{t.positions.transactionQuantity}</Label>
                  <Input
                    id="transactionQuantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={transactionForm.quantity}
                    onChange={(e) =>
                      setTransactionForm({
                        ...transactionForm,
                        quantity: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                  {transactionForm.type === 'SELL' && transactionTarget && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t.positions.availableQuantity}: {formatNumber(transactionTarget.quantity, locale)}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="transactionDate">{t.positions.transactionDate}</Label>
                  <Input
                    id="transactionDate"
                    type="date"
                    value={transactionForm.executedAt}
                    onChange={(e) => setTransactionForm({ ...transactionForm, executedAt: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t.positions.saveTransaction}</Button>
                <Button type="button" variant="outline" onClick={() => setTransactionDialogOpen(false)}>
                  {t.positions.cancel}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={planDialogOpen} onOpenChange={handlePlanDialogOpenChange}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {isEditingPlan
                  ? t.positions.planEdit
                  : planContextPosition
                    ? t.positions.planAddFor(planContextPosition.display)
                    : t.positions.planAddDialog}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePlanSubmit} className="space-y-4">
              {planContextPosition && (
                <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">{planContextPosition.display}</p>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                      {planContextPosition.symbol}
                    </Badge>
                    {t.positions.planLinkedHelper}
                  </p>
                </div>
              )}
              <div>
                <Label>{t.positions.planSideLabel}</Label>
                <RadioGroup
                  value={planForm.side}
                  onValueChange={(value) => setPlanForm({ ...planForm, side: value as PlanFormData['side'] })}
                  className="mt-2 grid gap-2 sm:grid-cols-2"
                >
                  <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-600">
                    <RadioGroupItem value="buy" id="plan-side-buy" className="order-[-1]" />
                    <span className="font-semibold text-slate-700">{t.positions.planSideBuy}</span>
                    <span className="text-xs text-slate-500">{t.positions.planSideBuyShort}</span>
                  </label>
                  <label
                    className={`flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm ${
                      canSelectSell ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    <RadioGroupItem value="sell" id="plan-side-sell" className="order-[-1]" disabled={!canSelectSell} />
                    <span className="font-semibold text-slate-700">{t.positions.planSideSell}</span>
                    <span className="text-xs text-slate-500">{t.positions.planSideSellShort}</span>
                  </label>
                </RadioGroup>
                {!canSelectSell && (
                  <p className="mt-1 text-xs text-slate-500">{t.positions.planSellDetachedHelper}</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-symbol">{t.positions.symbol}</Label>
                  <Input
                    id="plan-symbol"
                    value={planForm.symbol}
                    onChange={(e) => setPlanForm({ ...planForm, symbol: e.target.value.toUpperCase() })}
                    placeholder="AAPL"
                    required
                    disabled={Boolean(planContextPosition)}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-display">{t.positions.display}</Label>
                  <Input
                    id="plan-display"
                    value={planForm.display}
                    onChange={(e) => setPlanForm({ ...planForm, display: e.target.value })}
                    placeholder="Apple Inc."
                    required={!planContextPosition}
                    disabled={Boolean(planContextPosition)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="plan-image">{t.positions.imageUrl}</Label>
                <Input
                  id="plan-image"
                  value={planForm.imageUrl}
                  onChange={(e) => setPlanForm({ ...planForm, imageUrl: e.target.value })}
                  placeholder="https://logo.clearbit.com/apple.com"
                  disabled={Boolean(planContextPosition)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-target-price">{t.positions.planTargetPrice}</Label>
                  <Input
                    id="plan-target-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={Number.isFinite(planForm.targetPrice) ? planForm.targetPrice : 0}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        targetPrice: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-target-quantity">{t.positions.planTargetQuantity}</Label>
                  <Input
                    id="plan-target-quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={Number.isFinite(planForm.targetQuantity) ? planForm.targetQuantity : 0}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        targetQuantity: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-target-date">{t.positions.planTargetDate}</Label>
                  <Input
                    id="plan-target-date"
                    type="date"
                    value={planForm.targetDate}
                    onChange={(e) => setPlanForm({ ...planForm, targetDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t.positions.save}</Button>
                <Button type="button" variant="outline" onClick={() => handlePlanDialogOpenChange(false)}>
                  {t.positions.cancel}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={historyDialogOpen}
          onOpenChange={(open) => {
            setHistoryDialogOpen(open);
            if (!open) {
              setHistoryTargetId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t.positions.manageHistory}</DialogTitle>
              {historyTarget && (
                <p className="text-sm text-slate-500">
                  {historyTarget.display} · {historyTarget.symbol}
                </p>
              )}
            </DialogHeader>
            {historyTarget ? (
              historyTarget.lots && historyTarget.lots.length > 0 ? (
                <div className="space-y-3">
                  {[...(historyTarget.lots ?? [])]
                    .sort((a, b) => {
                      const aTime = new Date(a.executedAt).getTime();
                      const bTime = new Date(b.executedAt).getTime();
                      return Number.isNaN(bTime) || Number.isNaN(aTime) ? 0 : bTime - aTime;
                    })
                    .map((lot) => {
                      const typeLabel = lot.type === 'BUY' ? t.positions.buy : t.positions.sell;
                      const badgeTone =
                        lot.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';

                      return (
                        <div
                          key={`${lot.id}-${lot.executedAt}`}
                          className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3"
                        >
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}>
                            {typeLabel}
                          </span>
                          <div className="flex flex-col text-sm text-slate-600">
                            <span>
                              {formatNumber(lot.quantity, locale)} · {formatCurrency(lot.price, 'USD', locale)}
                            </span>
                            <span className="text-xs text-slate-500">{formatDate(lot.executedAt, locale)}</span>
                          </div>
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => historyTarget && openEditTransactionDialog(historyTarget, lot)}
                              aria-label={t.positions.editTransaction}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTransaction(lot)}
                              aria-label={t.positions.deleteTransaction}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t.positions.noTransactions}</p>
              )
            ) : (
              <p className="text-sm text-slate-500">{t.common.loading}</p>
            )}
            {historyTarget && (
              <Button className="mt-4 w-full" onClick={() => openTransactionDialog(historyTarget)}>
                <Plus className="h-4 w-4" />
                {t.positions.addTransaction}
              </Button>
            )}
          </DialogContent>
        </Dialog>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]">
          <div className="space-y-4">
            {loading ? (
              <Card className="border border-white/60 bg-white/80 shadow-sm backdrop-blur">
                <CardContent className="py-16 text-center text-slate-500">
                  {t.common.loading}
                </CardContent>
              </Card>
            ) : positions.length === 0 ? (
              <Card className="border border-dashed border-slate-300 bg-white/60 text-center shadow-none backdrop-blur">
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <p className="text-base font-semibold text-slate-700">{t.dashboard.noPositions}</p>
                  <p className="max-w-sm text-sm text-slate-500">{t.positions.emptyStateDescription}</p>
                  <Button onClick={openAddDialog} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t.positions.add}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {positions.map((position) => {
                  const sortedLots = [...(position.lots ?? [])].sort((a, b) => {
                    const aTime = new Date(a.executedAt).getTime();
                    const bTime = new Date(b.executedAt).getTime();
                    return Number.isNaN(bTime) || Number.isNaN(aTime) ? 0 : bTime - aTime;
                  });
                  const recentLots = sortedLots.slice(0, 5);
                  const positionActivePlans = (position.plans ?? []).filter(
                    (plan) => plan.status !== 'expired' && plan.status !== 'cancelled',
                  );

                  return (
                    <Card
                      key={position.id ?? position.symbol}
                      className="border border-white/60 bg-white/90 shadow-sm backdrop-blur"
                    >
                      <CardHeader className="gap-2">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-slate-900">
                          {position.display}
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {position.symbol}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          <span>{formatNumber(position.quantity, locale)}</span>
                          <span>•</span>
                          <span>{formatCurrency(position.entryPrice, 'USD', locale)}</span>
                          <span>•</span>
                          <span>{formatDate(position.entryDate, locale)}</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t.positions.transactionsTitle}
                            </p>
                            {recentLots.length > 0 ? (
                              <ul className="mt-3 space-y-2">
                                {recentLots.map((lot) => {
                                  const typeLabel = lot.type === 'BUY' ? t.positions.buy : t.positions.sell;
                                  const badgeTone =
                                    lot.type === 'BUY'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-rose-100 text-rose-700';
                                  return (
                                    <li
                                      key={`${lot.id}-${lot.executedAt}`}
                                      className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2"
                                    >
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}>
                                        {typeLabel}
                                      </span>
                                      <div className="flex flex-col text-sm text-slate-700">
                                        <span>
                                          {formatNumber(lot.quantity, locale)} · {formatCurrency(lot.price, 'USD', locale)}
                                        </span>
                                        <span className="text-xs text-slate-500">{formatDate(lot.executedAt, locale)}</span>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="mt-3 text-xs text-slate-400">{t.positions.noTransactions}</p>
                            )}
                            <Button
                              variant="link"
                              size="sm"
                              className="mt-3 h-auto px-0 text-xs font-semibold text-sky-600"
                              onClick={() => openHistoryDialog(position)}
                            >
                              <History className="mr-1 h-3 w-3" />
                              {t.positions.manageHistory}
                            </Button>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t.positions.activePlansTitle}
                            </p>
                            {positionActivePlans.length > 0 ? (
                              <ul className="mt-3 space-y-2">
                                {positionActivePlans.map((plan) => {
                                  const statusClass = planStatusClasses[plan.status];
                                  const statusLabel = planStatusLabels[plan.status];
                                  const sideClass =
                                    plan.side === 'sell'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-emerald-100 text-emerald-700';
                                  const sideLabel =
                                    plan.side === 'sell'
                                      ? t.positions.planSideSellShort
                                      : t.positions.planSideBuyShort;
                                  return (
                                    <li
                                      key={plan.id ?? `${plan.symbol}-${plan.targetDate}`}
                                      className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2"
                                    >
                                      <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge className={`${sideClass} text-[11px]`}>{sideLabel}</Badge>
                                          <Badge className={`${statusClass} text-[11px]`}>{statusLabel}</Badge>
                                          <span className="text-sm font-medium text-slate-700">{plan.symbol}</span>
                                        </div>
                                        <p className="text-sm text-slate-600">
                                          {formatNumber(plan.targetQuantity, locale)} · {formatCurrency(plan.targetPrice, 'USD', locale)} • {formatDate(plan.targetDate, locale)}
                                        </p>
                                        {plan.status === 'triggered' && plan.triggeredAt && (
                                          <p className="text-xs text-emerald-600">
                                            {t.positions.planTriggeredDetail(
                                              formatDate(plan.triggeredAt, locale),
                                              formatCurrency(plan.executedPrice ?? plan.targetPrice, 'USD', locale),
                                            )}
                                          </p>
                                        )}
                                        {plan.status === 'pending' && (
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 gap-1 px-2"
                                              onClick={() => openEditPlanDialog(plan, position)}
                                            >
                                              <Pencil className="h-4 w-4" />
                                              {t.positions.edit}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 gap-1 px-2"
                                              onClick={() => handlePlanCancel(plan)}
                                            >
                                              <Ban className="h-4 w-4" />
                                              {t.positions.planCancel}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="mt-3 text-xs text-slate-400">{t.positions.noActivePlans}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => openTransactionDialog(position)}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            {t.positions.addTransaction}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => openPlanDialogForPosition(position)}
                            disabled={!position.id}
                          >
                            <CalendarPlus className="h-4 w-4" />
                            {t.positions.addPlan}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Link href={`/stock/${position.symbol}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t.dashboard.viewDetails}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openHistoryDialog(position)}
                            aria-label={t.positions.manageHistory}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(position)}
                            aria-label={t.positions.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => position.id && handleDelete(position.id)}
                            aria-label={t.positions.delete}
                            disabled={!position.id}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <Card className="border border-white/60 bg-white/90 shadow-sm backdrop-blur">
              <CardHeader>
                <CardTitle>{t.dashboard.quickActions}</CardTitle>
                <CardDescription>{t.positions.quickActionsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full justify-start gap-2 shadow-sm" onClick={openAddDialog}>
                  <Plus className="h-4 w-4" />
                  {t.positions.add}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={openDetachedPlanDialog}
                >
                  <CalendarPlus className="h-4 w-4" />
                  {t.positions.addPlan}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    void processPlans();
                  }}
                >
                  <History className="h-4 w-4" />
                  {t.positions.processPlans}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={triggerRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.common.refresh}
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-white/60 bg-white/90 shadow-sm backdrop-blur">
              <CardHeader>
                <CardTitle>{t.positions.activePlansTitle}</CardTitle>
                <CardDescription>{t.positions.activePlansDescription}</CardDescription>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>
                    {t.positions.planStatusPending}: {formatNumber(pendingPlansCount, locale)}
                  </span>
                  <span>
                    {t.positions.planStatusTriggered}: {formatNumber(triggeredPlansCount, locale)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {activePlans.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.positions.noActivePlans}</p>
                ) : (
                  <ScrollArea className="max-h-[360px] pr-2">
                    <div className="space-y-4">
                      {activeLinkedPlans.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t.positions.activePlansLinked}
                          </p>
                          <div className="mt-2 space-y-3">
                            {activeLinkedPlans.map(({ plan, position }) => {
                              if (!position) {
                                return null;
                              }
                              const statusClass = planStatusClasses[plan.status];
                              const statusLabel = planStatusLabels[plan.status];
                              const sideClass =
                                plan.side === 'sell'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700';
                              const sideLabel =
                                plan.side === 'sell'
                                  ? t.positions.planSideSellShort
                                  : t.positions.planSideBuyShort;
                              return (
                                <div
                                  key={plan.id ?? `${position.id}-${plan.symbol}-${plan.targetDate}`}
                                  className="rounded-lg border border-slate-200 bg-white/70 p-3"
                                >
                                  <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-800">{position.display}</span>
                                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                        {position.symbol}
                                      </Badge>
                                      <Badge className={`${sideClass} text-[11px]`}>{sideLabel}</Badge>
                                      <Badge className={`${statusClass} text-[11px]`}>{statusLabel}</Badge>
                                    </div>
                                    <p className="text-sm text-slate-600">
                                      {formatNumber(plan.targetQuantity, locale)} · {formatCurrency(plan.targetPrice, 'USD', locale)} • {formatDate(plan.targetDate, locale)}
                                    </p>
                                    <p className="text-xs text-slate-500">{t.positions.planLinkedTo(position.display)}</p>
                                    {plan.status === 'triggered' && plan.triggeredAt && (
                                      <p className="text-xs text-emerald-600">
                                        {t.positions.planTriggeredDetail(
                                          formatDate(plan.triggeredAt, locale),
                                          formatCurrency(plan.executedPrice ?? plan.targetPrice, 'USD', locale),
                                        )}
                                      </p>
                                    )}
                                    {plan.status === 'pending' && (
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 gap-1 px-2"
                                          onClick={() => openEditPlanDialog(plan, position)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                          {t.positions.edit}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 gap-1 px-2"
                                          onClick={() => handlePlanCancel(plan)}
                                        >
                                          <Ban className="h-4 w-4" />
                                          {t.positions.planCancel}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {activeDetachedPlans.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t.positions.activePlansDetached}
                          </p>
                          <div className="mt-2 space-y-3">
                            {activeDetachedPlans.map(({ plan }) => {
                              const displayName = plan.display ?? plan.symbol;
                              const statusClass = planStatusClasses[plan.status];
                              const statusLabel = planStatusLabels[plan.status];
                              const sideClass =
                                plan.side === 'sell'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700';
                              const sideLabel =
                                plan.side === 'sell'
                                  ? t.positions.planSideSellShort
                                  : t.positions.planSideBuyShort;
                              return (
                                <div
                                  key={plan.id ?? `detached-${plan.symbol}-${plan.targetDate}`}
                                  className="rounded-lg border border-slate-200 bg-white/70 p-3"
                                >
                                  <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-800">{displayName}</span>
                                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                        {plan.symbol}
                                      </Badge>
                                      <Badge className={`${sideClass} text-[11px]`}>{sideLabel}</Badge>
                                      <Badge className={`${statusClass} text-[11px]`}>{statusLabel}</Badge>
                                    </div>
                                    <p className="text-sm text-slate-600">
                                      {formatNumber(plan.targetQuantity, locale)} · {formatCurrency(plan.targetPrice, 'USD', locale)} • {formatDate(plan.targetDate, locale)}
                                    </p>
                                    <p className="text-xs text-slate-500">{t.positions.planForNewPosition}</p>
                                    {plan.status === 'pending' && (
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 gap-1 px-2"
                                          onClick={() => openEditPlanDialog(plan)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                          {t.positions.edit}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 gap-1 px-2"
                                          onClick={() => handlePlanCancel(plan)}
                                        >
                                          <Ban className="h-4 w-4" />
                                          {t.positions.planCancel}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="border border-white/60 bg-white/90 shadow-sm backdrop-blur">
              <CardHeader>
                <CardTitle>{t.positions.closedPlansTitle}</CardTitle>
                <CardDescription>{t.positions.closedPlansDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {closedPlans.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.positions.noClosedPlans}</p>
                ) : (
                  <ScrollArea className="max-h-[360px] pr-2">
                    <div className="space-y-3">
                      {closedPlans.map(({ plan, position }) => {
                        const displayName = position?.display ?? plan.display ?? plan.symbol;
                        const symbol = position?.symbol ?? plan.symbol;
                        const statusClass = planStatusClasses[plan.status];
                        const statusLabel = planStatusLabels[plan.status];
                        const sideClass =
                          plan.side === 'sell'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700';
                        const sideLabel =
                          plan.side === 'sell'
                            ? t.positions.planSideSellShort
                            : t.positions.planSideBuyShort;
                        return (
                          <div
                            key={plan.id ?? `closed-${symbol}-${plan.targetDate}`}
                            className="rounded-lg border border-slate-200 bg-white/70 p-3"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-800">{displayName}</span>
                                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                  {symbol}
                                </Badge>
                                <Badge className={`${sideClass} text-[11px]`}>{sideLabel}</Badge>
                                <Badge className={`${statusClass} text-[11px]`}>{statusLabel}</Badge>
                              </div>
                              <p className="text-sm text-slate-600">
                                {formatNumber(plan.targetQuantity, locale)} · {formatCurrency(plan.targetPrice, 'USD', locale)} • {formatDate(plan.targetDate, locale)}
                              </p>
                              {plan.status === 'expired' && plan.expiredAt && (
                                <p className="text-xs text-slate-500">
                                  {t.positions.planExpiredDetail(formatDate(plan.expiredAt, locale))}
                                </p>
                              )}
                              {plan.status === 'cancelled' && plan.expiredAt && (
                                <p className="text-xs text-slate-500">
                                  {t.positions.planCancelledDetail(formatDate(plan.expiredAt, locale))}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 px-2"
                                  onClick={() => handlePlanDelete(plan)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                  {t.positions.planDelete}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
