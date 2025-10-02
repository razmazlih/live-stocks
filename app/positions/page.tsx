'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { Position } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Pencil, Trash2, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

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
  });

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('symbol');

      if (error) throw error;

      const mappedPositions: Position[] = (data || []).map(p => ({
        id: p.id,
        symbol: p.symbol,
        display: p.display,
        imageUrl: p.image_url,
        entryPrice: parseFloat(p.entry_price.toString()),
        quantity: parseFloat(p.quantity.toString()),
        entryDate: p.entry_date,
      }));

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
      entryDate: position.entryDate,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.symbol || !formData.display || !formData.entryPrice || !formData.quantity) {
      toast.error(locale === 'he' ? 'נא למלא את כל השדות' : 'Please fill all fields');
      return;
    }

    try {
      if (editingPosition) {
        const { error } = await supabase
          .from('positions')
          .update({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl || `https://logo.clearbit.com/${formData.symbol?.toLowerCase()}.com`,
            entry_price: formData.entryPrice,
            quantity: formData.quantity,
            entry_date: formData.entryDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPosition.id);

        if (error) throw error;
        toast.success(locale === 'he' ? 'הפוזיציה עודכנה' : 'Position updated');
      } else {
        const { error } = await supabase
          .from('positions')
          .insert({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl || `https://logo.clearbit.com/${formData.symbol?.toLowerCase()}.com`,
            entry_price: formData.entryPrice,
            quantity: formData.quantity,
            entry_date: formData.entryDate,
          });

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
                  <div>
                    <Label htmlFor="entryPrice">{t.positions.entryPrice}</Label>
                    <Input
                      id="entryPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.entryPrice}
                      onChange={(e) => setFormData({ ...formData, entryPrice: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">{t.positions.quantity}</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="entryDate">{t.positions.entryDate}</Label>
                    <Input
                      id="entryDate"
                      type="date"
                      value={formData.entryDate}
                      onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                      required
                    />
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
                      {position.quantity} @ ${position.entryPrice} • {position.entryDate}
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
