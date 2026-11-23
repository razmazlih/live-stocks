"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { getSupabaseClient } from '@/lib/supabase';
import { DEFAULT_COMMISSION_USD } from '@/lib/positions';
import { portfolioToday } from '@/lib/demo/review';
import { correctedLedgerPreview } from '@/lib/reconciliation-correction';
import { recordPositionPurchase } from '@/lib/position-purchase';
import { formatNumber } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import type { Locale, Position, PositionLotType, StockQuote } from '@/types';

export interface TransactionFormData {
  replacesCheckpoint?: boolean;
  id?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
  hasCommission: boolean;
  commissionAmount: number;
  commissionKnown: boolean;
}

export function createDefaultTransactionForm(type: PositionLotType = "BUY"): TransactionFormData {
  return {
    type,
    price: 0,
    quantity: 0,
    executedAt: portfolioToday(),
    hasCommission: false,
    commissionAmount: 0,
    commissionKnown: true,
  };
}

async function fetchQuotePrice(symbol: string): Promise<number | null> {
  const trimmedSymbol = symbol.trim().toUpperCase();

  if (!trimmedSymbol) {
    return null;
  }

  try {
    const response = await fetch(
      `/api/quote?symbol=${encodeURIComponent(trimmedSymbol)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return null;
    }

    const data: StockQuote = await response.json();

    if (typeof data.c === "number" && Number.isFinite(data.c) && data.c > 0) {
      return Number(data.c.toFixed(4));
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch quote price for symbol:", symbol, error);
    return null;
  }
}

export function MarketPriceSuggestion({ symbol, locale, currentQuote, onUse }: {
  symbol: string; locale: Locale; currentQuote?: number; onUse(price: number): void;
}) {
  const quoteSymbol = symbol.trim().toUpperCase();
  const provided = currentQuote !== undefined && Number.isFinite(currentQuote) && currentQuote > 0;
  const [quoteSuggestion, setQuoteSuggestion] = useState<{ symbol: string; price: number } | null>(null);
  useEffect(() => {
    if (!quoteSymbol || provided) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const price = await fetchQuotePrice(quoteSymbol);
      if (active && price !== null) setQuoteSuggestion({ symbol: quoteSymbol, price });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [quoteSymbol, provided]);

  const price = provided ? Number(currentQuote!.toFixed(4)) : quoteSuggestion?.symbol === quoteSymbol ? quoteSuggestion.price : undefined;
  if (price === undefined) return null;
  return <button type="button" className="mt-1 min-h-9 text-start text-xs font-medium text-primary underline-offset-4 hover:underline"
      onClick={() => onUse(price)}>
      {locale === 'he' ? 'השתמש במחיר השוק' : 'Use market quote'} · <bdi>{price.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })}</bdi>
  </button>;
}

export function TransactionComposer({ target: transactionTarget, initial, currentQuote, onCancel, onSaved, onSavingChange }: {
  target?: Position | null; initial: TransactionFormData; currentQuote?: number;
  onCancel(): void; onSaved(): void; onSavingChange?(saving: boolean): void;
}) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';
  const typeGroupName = useId();
  const [transactionForm, setTransactionForm] = useState(initial);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const transactionSaveLock = useRef(false);
  const transactionRequest = useRef<string | null>(null);

  async function handleTransactionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (transactionSaveLock.current) return;

    if (!transactionTarget?.location) {
      toast.error(t.common.error);
      return;
    }

    if (transactionForm.price <= 0 || transactionForm.quantity <= 0) {
      toast.error(
        locale === "he"
          ? "נא להזין מחיר וכמות חיוביים"
          : "Enter positive price and quantity",
      );
      return;
    }

    if (transactionForm.hasCommission && transactionForm.commissionAmount < 0) {
      toast.error(t.positions.transactionCommissionValidationError);
      return;
    }

    if (
      !transactionForm.id &&
      transactionForm.type === "SELL" &&
      transactionForm.quantity > transactionTarget.quantity
    ) {
      toast.error(
        locale === "he"
          ? "אין מספיק כמות פנויה למכירה"
          : "Not enough quantity to sell",
      );
      return;
    }

    if (transactionForm.replacesCheckpoint) {
      if (!transactionForm.commissionKnown || !transactionForm.executedAt || transactionForm.type === "RECONCILE") {
        toast.error(locale === "he" ? "יש להזין את תאריך הביצוע האמיתי ולאשר את העמלה, כולל אם לא הייתה עמלה." : "Enter the actual execution date and confirm the fee, including no commission.");
        return;
      }
      try {
        const preview = correctedLedgerPreview(transactionTarget.lots ?? [], transactionForm.id!, { ...transactionForm, id: transactionForm.id, type: transactionForm.type });
        if (!confirm(locale === "he"
          ? `להחליף את התאמת היתרה בעסקה האמיתית שהזנת? כמות לפני: ${preview.before}; אחרי: ${preview.after}. עסקאות אחרות נשמרות.${preview.historyStillIncomplete ? " נותרו התאמות נוספות ולכן ההיסטוריה עדיין חלקית." : ""}`
          : `Replace this balance checkpoint with the actual transaction entered? Shares before: ${preview.before}; after: ${preview.after}. Other transactions are preserved.${preview.historyStillIncomplete ? " Other checkpoints remain, so history is still incomplete." : ""}`)) return;
      } catch {
        toast.error(locale === "he" ? "התיקון משאיר מכירה ללא מספיק מניות בתאריך הביצוע. יש להשלים קודם את העסקאות החסרות." : "The correction leaves a sale without enough shares at execution. Supply the missing transactions first.");
        return;
      }
    }

    transactionSaveLock.current = true;
    setSavingTransaction(true);
    onSavingChange?.(true);
    try {
      const commissionAmount = transactionForm.hasCommission
        ? Math.max(transactionForm.commissionAmount, 0)
        : 0;
      const supabase = getSupabaseClient();
      if (transactionForm.id) {
        const { error } = await supabase
          .from("position_lots")
          .update({
            side: transactionForm.type,
            price: transactionForm.price,
            quantity: transactionForm.quantity,
            executed_at: transactionForm.executedAt,
            has_commission: transactionForm.hasCommission,
            commission_amount: commissionAmount,
            commission_known: transactionForm.commissionKnown,
            ...(transactionForm.replacesCheckpoint ? { basis_acquired_on: null, basis_date_estimate: null } : {}),
          })
          .eq("id", transactionForm.id);

        if (error) throw error;

        toast.success(t.positions.transactionUpdated);
      } else if (!transactionTarget.id) {
        if (transactionForm.type !== 'BUY') throw new Error('An existing holding is required for a sale');
        await recordPositionPurchase(supabase, {
          requestId: transactionRequest.current ??= crypto.randomUUID(),
          symbol: transactionTarget.symbol, display: transactionTarget.display, imageUrl: transactionTarget.imageUrl ?? '',
          location: transactionTarget.location, price: transactionForm.price, quantity: transactionForm.quantity,
          executedAt: transactionForm.executedAt, hasCommission: transactionForm.hasCommission, commissionAmount,
        });
        toast.success(t.positions.transactionSaved);
      } else {
        const id = transactionRequest.current ??= crypto.randomUUID();
        const lot = {
          id,
          position_id: transactionTarget.id,
          side: transactionForm.type,
          price: transactionForm.price,
          quantity: transactionForm.quantity,
          executed_at: transactionForm.executedAt,
          has_commission: transactionForm.hasCommission,
          commission_amount: commissionAmount,
          commission_known: transactionForm.commissionKnown,
        };
        const { error } = await supabase.from("position_lots").insert(lot);
        if (error) {
          // A dropped response may follow a committed insert. Verify the original lot before reporting success.
          const { data, error: lookupError } = await supabase.from("position_lots")
            .select("id, position_id, side, price, quantity, executed_at, has_commission, commission_amount, commission_known")
            .eq("id", id).eq("position_id", lot.position_id).maybeSingle();
          if (lookupError || !data || data.side !== lot.side || Number(data.price) !== lot.price
            || Number(data.quantity) !== lot.quantity || data.executed_at !== lot.executed_at
            || data.has_commission !== lot.has_commission || Number(data.commission_amount) !== lot.commission_amount
            || data.commission_known !== lot.commission_known) throw error;
        }

        toast.success(t.positions.transactionSaved);
      }

      onSaved();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error(t.common.error);
    } finally {
      transactionSaveLock.current = false;
      setSavingTransaction(false);
      onSavingChange?.(false);
    }
  }

  return (
  <form onSubmit={handleTransactionSubmit} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 [&_input]:h-11 sm:px-7 [&_input]:sm:h-10">
    {transactionForm.replacesCheckpoint && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {locale === "he" ? "התאמת יתרה אינה עסקה. כאן ניתן להחליף אותה בקנייה או במכירה שבוצעה בפועל. יש להזין מחיר, כמות ותאריך ביצוע אמיתיים ולציין עמלה. אין להעתיק יתרה מצטברת כקנייה נוספת. אם היו כמה עסקאות, יש לרשום את כולן בנפרד." : "A balance checkpoint is not a transaction. Replace it only with an actual executed buy or sell: enter its execution price, quantity, date and fee. Do not treat a cumulative balance as another purchase. Multiple executions must be recorded separately."}
    </div>}
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t.positions.transactionType}</legend>
      <p className="text-xs text-slate-500">{locale === "he" ? "בחר את הפעולה שמתבצעת כעת." : "Choose the action you are recording."}</p>
      <div className="grid grid-cols-2 gap-3">
        {(["BUY", "SELL"] as const).map(type => (
          <label key={type} className={cn(
            "relative flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
            transactionForm.type !== type && "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            transactionForm.type === type && (type === "BUY" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-rose-500 bg-rose-50 text-rose-800"),
          )}>
            <input type="radio" name={typeGroupName} value={type} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              checked={transactionForm.type === type}
              onChange={() => setTransactionForm(previous => ({ ...previous, type }))} />
            {type === "BUY" ? t.positions.buy : t.positions.sell}
          </label>
        ))}
      </div>
    </fieldset>
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{locale === "he" ? "פרטי העסקה" : "Transaction details"}</p>
        <p className="mt-1 text-xs text-slate-500">{locale === "he" ? "מחיר, כמות ותאריך ביצוע." : "Price, quantity, and execution date."}</p>
      </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-1">
        <Label htmlFor="transactionPrice">
          {t.positions.transactionPrice}
        </Label>
        <Input
          id="transactionPrice"
          type="number"
          step="0.0001"
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
          {!transactionForm.id && transactionTarget && <MarketPriceSuggestion symbol={transactionTarget.symbol} locale={locale}
          currentQuote={currentQuote} onUse={price => setTransactionForm(previous => ({ ...previous, price }))} />}
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor="transactionQuantity">
          {t.positions.transactionQuantity}
        </Label>
        <Input
          id="transactionQuantity"
          type="number"
          step="0.0001"
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
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor="transactionDate">
          {t.positions.transactionDate}
        </Label>
        <DatePicker
          id="transactionDate"
          locale={locale}
          value={transactionForm.executedAt}
          onChange={(executedAt) => setTransactionForm({ ...transactionForm, executedAt })}
          required
        />
      </div>
    </div>
    {transactionForm.type === "SELL" && transactionTarget && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {t.positions.availableQuantity}: {formatNumber(transactionTarget.quantity, locale)}
      </div>
    )}
    </section>
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label
            htmlFor="transaction-commission-toggle"
            className="text-sm font-medium"
          >
            {t.positions.transactionCommissionToggle}
          </Label>
          <p className="text-xs text-slate-500">
            {t.positions.transactionCommissionHelper}
          </p>
        </div>
        <Switch
          id="transaction-commission-toggle"
          checked={transactionForm.hasCommission}
          onCheckedChange={(checked) =>
            setTransactionForm((previous) => ({
              ...previous,
              hasCommission: checked,
              commissionKnown: checked ? previous.commissionKnown : true,
              commissionAmount: checked
                ? previous.commissionAmount > 0
                  ? previous.commissionAmount
                  : previous.commissionKnown ? DEFAULT_COMMISSION_USD : 0
                : 0,
            }))
          }
        />
      </div>
      {!transactionForm.commissionKnown ? (
        <div className="mt-3 rounded-lg bg-[var(--warning-soft)] p-3 text-xs leading-relaxed text-[var(--warning-text)]" role="status">
          <p>{locale === "he" ? "העמלה בעסקה הזאת עדיין לא ידועה. אפשר להפעיל את שדה העמלה ולהזין את הסכום, או לאשר שלא הייתה עמלה." : "The commission for this transaction is still unknown. Enable the commission field and enter the amount, or confirm there was no commission."}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setTransactionForm(previous => ({ ...previous, hasCommission: false, commissionAmount: 0, commissionKnown: true }))}>
            {locale === "he" ? "לא הייתה עמלה" : "No commission was charged"}
          </Button>
        </div>
      ) : null}
      {transactionForm.hasCommission && <div className="mt-4 border-t border-slate-200 pt-4">
        <Label htmlFor="transaction-commission-amount">
          {t.positions.transactionCommissionAmount}
        </Label>
        <Input
          id="transaction-commission-amount"
          type="number"
          step="0.01"
          min="0"
          value={transactionForm.commissionAmount}
          onChange={(e) =>
            setTransactionForm({
              ...transactionForm,
              commissionKnown: e.target.value.trim() !== "" && Number.isFinite(Number(e.target.value)),
              commissionAmount:
                Number.parseFloat(e.target.value) || 0,
            })
          }
          disabled={!transactionForm.hasCommission}
          required={transactionForm.hasCommission}
        />
      </div>}
    </section>
    </div>
    <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:h-10"
        disabled={savingTransaction} onClick={onCancel}
      >
        {t.positions.cancel}
      </Button>
      <Button type="submit" disabled={savingTransaction || !transactionTarget?.location} className="h-11 sm:h-10">{savingTransaction ? (isRtl ? "שומר…" : "Saving…") : t.positions.saveTransaction}</Button>
    </div>
  </form>
  );
}
