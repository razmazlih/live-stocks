'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { Position, PositionLot, PositionLotType } from '@/types';
import { mapPositionRow } from '@/lib/positions';
import { formatCurrency, formatDate, formatNumber } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Pencil, Trash2, BarChart3, ArrowRightLeft, History } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface PositionFormData {
  symbol: string;
  display: string;
  imageUrl: string;
  initialPrice: number;
  initialQuantity: number;
  initialDate: string;
}

interface TransactionFormData {
  id?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
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

export default function PositionsPage() {
  const { locale, triggerRefresh } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
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
  });
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionTarget, setTransactionTarget] = useState<Position | null>(null);
  const [transactionForm, setTransactionForm] = useState<TransactionFormData>(createDefaultTransactionForm());
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const isEditing = Boolean(editingPosition);
  const isEditingTransaction = Boolean(transactionForm.id);

  const historyTarget = useMemo(() => {
    if (!historyTargetId) {
      return null;
    }
    return positions.find((position) => position.id === historyTargetId) ?? null;
  }, [historyTargetId, positions]);

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('positions')
        .select('*, position_lots(*)')
        .order('symbol');

      if (error) throw error;

      const mappedPositions: Position[] = (data || []).map(mapPositionRow);

      setPositions(mappedPositions);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast.error(t.common.error);
    } finally {
      setLoading(false);
    }
  }, [t.common.error]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  function openAddDialog() {
    setEditingPosition(null);
    setFormData({
      symbol: '',
      display: '',
      imageUrl: '',
      initialPrice: 0,
      initialQuantity: 0,
      initialDate: getTodayIsoDate(),
    });
    setDialogOpen(true);
  }

  function openEditDialog(position: Position) {
    setEditingPosition(position);
    setFormData({
      symbol: position.symbol,
      display: position.display,
      imageUrl: position.imageUrl,
      initialPrice: position.entryPrice,
      initialQuantity: position.quantity,
      initialDate: position.entryDate,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.symbol || !formData.display) {
      toast.error(locale === 'he' ? 'נא למלא את כל השדות' : 'Please fill all fields');
      return;
    }

    if (!editingPosition) {
      if (formData.initialPrice <= 0 || formData.initialQuantity <= 0) {
        toast.error(locale === 'he' ? 'נדרש מחיר וכמות חיוביים לכניסה' : 'Positive price and quantity are required');
        return;
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
      } else {
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
      }

      setDialogOpen(false);
      loadPositions();
      triggerRefresh();
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
      <div className="max-w-5xl mx-auto p-6">
        <header className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {locale === 'he' ? 'חזרה' : 'Back'}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-[#0F172A]">{t.positions.title}</h1>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t.positions.add}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingPosition ? t.positions.edit : t.positions.add}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="symbol">{t.positions.symbol}</Label>
                    <Input
                      id="symbol"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                      placeholder="AAPL"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="display">{t.positions.display}</Label>
                    <Input
                      id="display"
                      value={formData.display}
                      onChange={(e) => setFormData({ ...formData, display: e.target.value })}
                      placeholder="Apple Inc."
                      required
                    />
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
                  {isEditing ? (
                    editingPosition && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                        <p className="font-semibold text-slate-700">{t.positions.currentHolding}</p>
                        <p className="mt-2">
                          {formatNumber(editingPosition.quantity, locale)} · {formatCurrency(editingPosition.entryPrice, 'USD', locale)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t.positions.since} {formatDate(editingPosition.entryDate, locale)}
                        </p>
                      </div>
                    )
                  ) : (
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
              <DialogContent>
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
                          const badgeTone = lot.type === 'BUY'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700';

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
                    <Plus className="w-4 h-4" />
                    {t.positions.addTransaction}
                  </Button>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">{t.common.loading}</div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">{t.dashboard.noPositions}</p>
              <Button onClick={openAddDialog}>
                <Plus className="w-4 h-4 mr-2" />
                {t.positions.add}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((position) => {
                const sortedLots = [...(position.lots ?? [])].sort((a, b) => {
                  const aTime = new Date(a.executedAt).getTime();
                  const bTime = new Date(b.executedAt).getTime();
                  return Number.isNaN(bTime) || Number.isNaN(aTime) ? 0 : bTime - aTime;
                });
                const recentLots = sortedLots.slice(0, 6);

                return (
                  <div
                    key={position.id}
                    className="rounded-lg border border-gray-200 bg-white/70 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 space-y-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900">{position.display}</span>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                              {position.symbol}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {formatNumber(position.quantity, locale)} · {formatCurrency(position.entryPrice, 'USD', locale)} • {formatDate(position.entryDate, locale)}
                          </p>
                        </div>

                        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t.positions.transactionsTitle}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                {sortedLots.length === recentLots.length
                                  ? sortedLots.length
                                  : `${recentLots.length}/${sortedLots.length}`}
                              </span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto px-0 text-[11px] text-slate-500 hover:text-slate-700"
                                onClick={() => openHistoryDialog(position)}
                              >
                                <History className="mr-1 h-3 w-3" />
                                {t.positions.manageHistory}
                              </Button>
                            </div>
                          </div>
                          {recentLots.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-sm text-slate-600">
                              {recentLots.map((lot) => {
                                const typeLabel = lot.type === 'BUY' ? t.positions.buy : t.positions.sell;
                                const badgeTone = lot.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
                                return (
                                  <li
                                    key={`${lot.id}-${lot.executedAt}`}
                                    className="flex items-center gap-2"
                                  >
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}>
                                      {typeLabel}
                                    </span>
                                    <span>
                                      {formatNumber(lot.quantity, locale)} · {formatCurrency(lot.price, 'USD', locale)}
                                    </span>
                                    <span className="ml-auto text-xs text-slate-500">{formatDate(lot.executedAt, locale)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">{t.positions.noTransactions}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-stretch gap-2 sm:items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTransactionDialog(position)}
                        >
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          {t.positions.addTransaction}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openHistoryDialog(position)}
                        >
                          <History className="mr-2 h-4 w-4" />
                          {t.positions.manageHistory}
                        </Button>
                        <div className="flex justify-end gap-2">
                          <Link href={`/stock/${position.symbol}`}>
                            <Button variant="ghost" size="sm">
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(position)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(position.id!)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
