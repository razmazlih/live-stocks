'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { LotExit, Position, PositionLot } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Pencil, Trash2, BarChart3, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatDateForInput, mapSupabasePosition, preparePositionPersistencePayload } from '@/lib/positions';

export default function PositionsPage() {
  const { locale, triggerRefresh } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<Partial<Position>>({
    symbol: '',
    display: '',
    imageUrl: '',
    entryPrice: 0,
    quantity: 0,
    entryDate: new Date().toISOString().split('T')[0],
    lots: [
      {
        entryPrice: 0,
        entryQuantity: 0,
        entryDate: new Date().toISOString().split('T')[0],
        exits: [],
      },
    ],
  });

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('symbol');

      if (error) throw error;

      const mappedPositions: Position[] = (data || []).map(mapSupabasePosition);

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
      entryPrice: 0,
      quantity: 0,
      entryDate: new Date().toISOString().split('T')[0],
      lots: [
        {
          entryPrice: 0,
          entryQuantity: 0,
          entryDate: new Date().toISOString().split('T')[0],
          exits: [],
        },
      ],
    });
    setDialogOpen(true);
  }

  function openEditDialog(position: Position) {
    setEditingPosition(position);
    setFormData({
      symbol: position.symbol,
      display: position.display,
      imageUrl: position.imageUrl,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      entryDate: formatDateForInput(position.entryDate),
      lots: position.lots?.map((lot) => ({
        ...lot,
        entryDate: formatDateForInput(lot.entryDate),
        exits: lot.exits?.map((exit) => ({
          ...exit,
          exitDate: formatDateForInput(exit.exitDate),
        })) || [],
      })),
    });
    setDialogOpen(true);
  }

  function updateLot(index: number, changes: Partial<PositionLot>) {
    const sanitized: Partial<PositionLot> = { ...changes };
    if (typeof sanitized.entryPrice === 'number') {
      sanitized.entryPrice = Number.isFinite(sanitized.entryPrice) ? sanitized.entryPrice : 0;
    }
    if (typeof sanitized.entryQuantity === 'number') {
      sanitized.entryQuantity = Number.isFinite(sanitized.entryQuantity) ? sanitized.entryQuantity : 0;
    }
    setFormData((prev) => {
      const lots = [...(prev.lots || [])];
      lots[index] = { ...lots[index], ...sanitized } as PositionLot;
      return { ...prev, lots };
    });
  }

  function addLot() {
    setFormData((prev) => ({
      ...prev,
      lots: [
        ...(prev.lots || []),
        {
          entryPrice: 0,
          entryQuantity: 0,
          entryDate: new Date().toISOString().split('T')[0],
          exits: [],
        },
      ],
    }));
  }

  function removeLot(index: number) {
    setFormData((prev) => {
      const lots = [...(prev.lots || [])];
      lots.splice(index, 1);
      if (!lots.length) {
        lots.push({
          entryPrice: 0,
          entryQuantity: 0,
          entryDate: new Date().toISOString().split('T')[0],
          exits: [],
        });
      }
      return { ...prev, lots };
    });
  }

  function addExit(lotIndex: number) {
    setFormData((prev) => {
      const lots = [...(prev.lots || [])];
      const lot = lots[lotIndex];
      if (!lot) {
        return prev;
      }
      const exits = [...(lot.exits || []), {
        quantity: 0,
        exitPrice: 0,
        exitDate: new Date().toISOString().split('T')[0],
      } as LotExit];
      lots[lotIndex] = { ...lot, exits };
      return { ...prev, lots };
    });
  }

  function updateExit(lotIndex: number, exitIndex: number, changes: Partial<LotExit>) {
    const sanitized: Partial<LotExit> = { ...changes };
    if (typeof sanitized.quantity === 'number') {
      sanitized.quantity = Number.isFinite(sanitized.quantity) ? sanitized.quantity : 0;
    }
    if (typeof sanitized.exitPrice === 'number') {
      sanitized.exitPrice = Number.isFinite(sanitized.exitPrice) ? sanitized.exitPrice : 0;
    }
    setFormData((prev) => {
      const lots = [...(prev.lots || [])];
      const lot = lots[lotIndex];
      if (!lot) {
        return prev;
      }
      const exits = [...(lot.exits || [])];
      exits[exitIndex] = { ...exits[exitIndex], ...sanitized } as LotExit;
      lots[lotIndex] = { ...lot, exits };
      return { ...prev, lots };
    });
  }

  function removeExit(lotIndex: number, exitIndex: number) {
    setFormData((prev) => {
      const lots = [...(prev.lots || [])];
      const lot = lots[lotIndex];
      if (!lot) {
        return prev;
      }
      const exits = [...(lot.exits || [])];
      exits.splice(exitIndex, 1);
      lots[lotIndex] = { ...lot, exits };
      return { ...prev, lots };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.symbol || !formData.display) {
      toast.error(locale === 'he' ? 'נא למלא את כל השדות' : 'Please fill all fields');
      return;
    }

    const lots = formData.lots || [];

    if (!lots.length || lots.some((lot) => !lot.entryPrice || !lot.entryQuantity || !lot.entryDate)) {
      toast.error(locale === 'he' ? 'נא להזין לפחות לוט אחד עם מחיר, כמות ותאריך' : 'Please provide at least one lot with price, quantity, and date');
      return;
    }

    try {
      const payload = preparePositionPersistencePayload({ ...formData, lots });

      if (editingPosition) {
        const { error } = await supabase
          .from('positions')
          .update(payload)
          .eq('id', editingPosition.id);

        if (error) throw error;
        toast.success(locale === 'he' ? 'הפוזיציה עודכנה' : 'Position updated');
      } else {
        const { updated_at, ...insertPayload } = payload;
        const { error } = await supabase
          .from('positions')
          .insert(insertPayload);

        if (error) throw error;
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>{t.positions.lots}</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addLot}>
                        <Plus className="w-4 h-4 mr-1" />
                        {t.positions.addLot}
                      </Button>
                    </div>
                    {(formData.lots || []).map((lot, lotIndex) => (
                      <div key={lotIndex} className="space-y-3 rounded-lg border border-dashed border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">
                            {t.positions.lotLabel} #{lotIndex + 1}
                          </span>
                          {(formData.lots?.length || 0) > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeLot(lotIndex)}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <Label>{t.positions.entryPrice}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={lot.entryPrice}
                              onChange={(e) => updateLot(lotIndex, { entryPrice: parseFloat(e.target.value) })}
                              required
                            />
                          </div>
                          <div>
                            <Label>{t.positions.entryQuantity}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={lot.entryQuantity}
                              onChange={(e) => updateLot(lotIndex, { entryQuantity: parseFloat(e.target.value) })}
                              required
                            />
                          </div>
                          <div>
                            <Label>{t.positions.entryDate}</Label>
                            <Input
                              type="date"
                              value={lot.entryDate}
                              onChange={(e) => updateLot(lotIndex, { entryDate: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-600">{t.positions.exits}</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => addExit(lotIndex)}>
                              <Plus className="w-4 h-4 mr-1" />
                              {t.positions.addExit}
                            </Button>
                          </div>
                          {(lot.exits || []).length === 0 ? (
                            <p className="text-xs text-slate-400">{t.positions.noExits}</p>
                          ) : (
                            <div className="space-y-3">
                              {(lot.exits || []).map((exit, exitIndex) => (
                                <div key={exitIndex} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                  <div>
                                    <Label>{t.positions.exitQuantity}</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={exit.quantity}
                                      onChange={(e) => updateExit(lotIndex, exitIndex, { quantity: parseFloat(e.target.value) })}
                                    />
                                  </div>
                                  <div>
                                    <Label>{t.positions.exitPrice}</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={exit.exitPrice}
                                      onChange={(e) => updateExit(lotIndex, exitIndex, { exitPrice: parseFloat(e.target.value) })}
                                    />
                                  </div>
                                  <div>
                                    <Label>{t.positions.exitDate}</Label>
                                    <Input
                                      type="date"
                                      value={exit.exitDate}
                                      onChange={(e) => updateExit(lotIndex, exitIndex, { exitDate: e.target.value })}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeExit(lotIndex, exitIndex)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
              {positions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-white/50"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">
                      {position.display} ({position.symbol})
                    </div>
                    <div className="text-sm text-gray-600">
                      {position.quantity} @ ${Number(position.entryPrice || 0).toFixed(2)} • {position.entryDate ? position.entryDate.split('T')[0] : ''}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {position.lots.map((lot, index) => (
                        <div key={index}>
                          <div>
                            {t.positions.lotLabel} #{index + 1}: {lot.entryQuantity} @ ${Number(lot.entryPrice || 0).toFixed(2)} • {lot.entryDate ? lot.entryDate.split('T')[0] : ''}
                          </div>
                          {(lot.exits || []).map((exit, exitIndex) => (
                            <div key={exitIndex} className="pl-4">
                              {t.positions.exitLabel} #{exitIndex + 1}: {exit.quantity} @ ${Number(exit.exitPrice || 0).toFixed(2)} • {exit.exitDate ? exit.exitDate.split('T')[0] : ''}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
