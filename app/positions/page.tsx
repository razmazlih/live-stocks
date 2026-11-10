"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useApp } from "@/lib/context";
import { useTranslation } from "@/lib/translations";
import { getSupabaseClient } from "@/lib/supabase";
import {
  Position,
  PositionLocation,
  PositionLot,
  PositionLotType,
  StockQuote,
} from "@/types";
import {
  DEFAULT_COMMISSION_USD,
  mapPositionRow,
} from "@/lib/positions";
import { formatCurrency, formatDate, formatNumber } from "@/lib/calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { BankBadge } from "@/components/branding/bank-badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StockAvatarImage } from "@/components/ui/stock-avatar-image";
import { Switch } from "@/components/ui/switch";
import { PositionAssetPicker } from "@/components/portfolio/position-asset-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCommonQuickActions } from "@/components/dashboard/common-quick-actions";
import type { DashboardQuickAction } from "@/components/dashboard/quick-actions";
import { DashboardRouteShell } from "@/components/dashboard/dashboard-route-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardContainer, DashboardMain } from "@/components/dashboard/page-primitives";
import {
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  ArrowRightLeft,
  History,
  Layers,
  CalendarClock,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import { useReturnContext } from "@/hooks/use-return-context";
import { parsePositionsState } from "@/lib/list-url-state";
import { buildStockHref, rememberReturnContext } from "@/lib/navigation-context";

interface PositionFormData {
  symbol: string;
  display: string;
  imageUrl: string;
  location: PositionLocation;
  initialPrice: number;
  initialQuantity: number;
  initialDate: string;
  initialHasCommission: boolean;
  initialCommissionAmount: number;
}

interface TransactionFormData {
  id?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
  hasCommission: boolean;
  commissionAmount: number;
}

type PositionLocationFilter = PositionLocation | "all";
type PositionSortOption =
  | "latest_activity"
  | "symbol_asc"
  | "symbol_desc"
  | "quantity_desc"
  | "entry_date_desc";

interface PositionListItem {
  position: Position;
  sortedLots: PositionLot[];
  recentLots: PositionLot[];
  lastActivityDate: string;
  lastActivityTimestamp: number;
  fallbackInitials: string;
}

function getTimestampFromIsoDate(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function buildFallbackInitials(display: string, symbol: string): string {
  return (
    (display || symbol || "?")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?"
  );
}

function getTodayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function createDefaultTransactionForm(): TransactionFormData {
  return {
    type: "BUY",
    price: 0,
    quantity: 0,
    executedAt: getTodayIsoDate(),
    hasCommission: false,
    commissionAmount: 0,
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
      return data.c;
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch quote price for symbol:", symbol, error);
    return null;
  }
}

function parseActivityState(params: URLSearchParams) {
  return { ...parsePositionsState(params), add: params.get('action') === 'add' };
}

export default function PositionsPage() {
  const { locale, triggerRefresh, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserSearch, setChooserSearch] = useState('');
  const [entryFromChooser, setEntryFromChooser] = useState(false);
  const entryTriggerRef = useRef<HTMLElement | null>(null);
  const entryTransitionRef = useRef(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<PositionFormData>({
    symbol: "",
    display: "",
    imageUrl: "",
    location: "bank_one",
    initialPrice: 0,
    initialQuantity: 0,
    initialDate: getTodayIsoDate(),
    initialHasCommission: false,
    initialCommissionAmount: 0,
  });
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionTarget, setTransactionTarget] = useState<Position | null>(
    null,
  );
  const [transactionForm, setTransactionForm] = useState<TransactionFormData>(
    createDefaultTransactionForm(),
  );
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [{ searchTerm, locationFilter, sortOption, pageSize, currentPage, add }, patchUrl, sourceUrl] = useUrlState(parseActivityState);
  const setSearchTerm = (value: string) => patchUrl({ q: value, page: null });
  const setLocationFilter = (value: PositionLocationFilter) => patchUrl({ account: value === "all" ? null : value, page: null });
  const setSortOption = (value: PositionSortOption) => patchUrl({ sort: value, page: null });
  const setPageSize = (value: number) => patchUrl({ pageSize: value, page: null });
  const setCurrentPage = useCallback((value: number | ((previous: number) => number)) => patchUrl({ page: typeof value === "function" ? value(currentPage) : value }), [currentPage, patchUrl]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestIdRef = useRef(0);
  useReturnContext(hasLoaded && Boolean(sourceUrl));
  const lastFetchedSymbolRef = useRef<string | null>(null);
  const isEditing = Boolean(editingPosition);
  const isEditingTransaction = Boolean(transactionForm.id);
  const isRtl = locale === "he";

  const historyTarget = useMemo(() => {
    if (!historyTargetId) {
      return null;
    }
    return (
      positions.find((position) => position.id === historyTargetId) ?? null
    );
  }, [historyTargetId, positions]);

  const totalQuantity = useMemo(
    () =>
      positions.reduce(
        (sum, position) =>
          sum + (Number.isFinite(position.quantity) ? position.quantity : 0),
        0,
      ),
    [positions],
  );

  const positionItems = useMemo<PositionListItem[]>(
    () =>
      positions.map((position) => {
        const sortedLots = [...(position.lots ?? [])].sort((a, b) => {
          const aTime = getTimestampFromIsoDate(a.executedAt);
          const bTime = getTimestampFromIsoDate(b.executedAt);
          return bTime - aTime;
        });

        const recentLots = sortedLots.slice(0, 3);
        const lastLotDate = sortedLots[0]?.executedAt ?? position.entryDate;

        return {
          position,
          sortedLots,
          recentLots,
          lastActivityDate: lastLotDate,
          lastActivityTimestamp: getTimestampFromIsoDate(lastLotDate),
          fallbackInitials: buildFallbackInitials(position.display, position.symbol),
        };
      }),
    [positions],
  );

  const chooserItems = useMemo(() => {
    const query = chooserSearch.trim().toLocaleLowerCase(locale);
    const sorted = [...positionItems].sort((a, b) => b.lastActivityTimestamp - a.lastActivityTimestamp);
    return query ? sorted.filter(({ position }) => `${position.symbol} ${position.display}`.toLocaleLowerCase(locale).includes(query)) : sorted.slice(0, 6);
  }, [positionItems, chooserSearch, locale]);

  const filteredPositionItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toUpperCase();

    const filtered = positionItems.filter(({ position }) => {
      if (
        locationFilter !== "all" &&
        position.location !== locationFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const symbol = position.symbol.toUpperCase();
      const display = position.display.toUpperCase();

      return (
        symbol.includes(normalizedSearch) || display.includes(normalizedSearch)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortOption === "latest_activity") {
        return (
          b.lastActivityTimestamp - a.lastActivityTimestamp ||
          a.position.symbol.localeCompare(b.position.symbol)
        );
      }

      if (sortOption === "symbol_desc") {
        return b.position.symbol.localeCompare(a.position.symbol);
      }

      if (sortOption === "quantity_desc") {
        return (
          b.position.quantity - a.position.quantity ||
          a.position.symbol.localeCompare(b.position.symbol)
        );
      }

      if (sortOption === "entry_date_desc") {
        return (
          getTimestampFromIsoDate(b.position.entryDate) -
            getTimestampFromIsoDate(a.position.entryDate) ||
          a.position.symbol.localeCompare(b.position.symbol)
        );
      }

      return a.position.symbol.localeCompare(b.position.symbol);
    });

    return sorted;
  }, [locationFilter, positionItems, searchTerm, sortOption]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPositionItems.length / pageSize)),
    [filteredPositionItems.length, pageSize],
  );

  useEffect(() => {
    if (hasLoaded && !loading && sourceUrl && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, hasLoaded, loading, sourceUrl, setCurrentPage]);

  const paginatedPositionItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPositionItems.slice(start, start + pageSize);
  }, [currentPage, filteredPositionItems, pageSize]);

  const hasActiveFilters = Boolean(searchTerm.trim()) || locationFilter !== "all";
  const displayFrom =
    filteredPositionItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const displayTo = Math.min(currentPage * pageSize, filteredPositionItems.length);

  const headerMetaBadges = [
    {
      key: "positions",
      icon: Layers,
      label: `${t.positions.overviewActivePositions}: ${!hasLoaded ? '—' : positions.filter((position) => position.quantity > 0).length.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US')}`,
      className: "bg-blue-50 text-blue-600",
      iconClassName: "text-blue-500",
    },
    {
      key: "quantity",
      icon: CalendarClock,
      label: `${t.positions.overviewTotalQuantity}: ${!hasLoaded ? '—' : formatNumber(totalQuantity, locale)}`,
      className: "bg-[color:var(--color-neutral-white)]/70 text-slate-600",
      iconClassName: "text-slate-500",
    },
  ];

  const loadPositions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("positions")
        .select("*, position_lots(*)")
        .order("symbol");

      if (error) throw error;

      const mappedPositions: Position[] = (data || []).map(mapPositionRow);
      if (requestId !== requestIdRef.current) return;
      setPositions(mappedPositions);
      setHasLoaded(true);
      setLoadError(false);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(true);
      console.error("Error loading positions:", error);
      toast.error(t.common.error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [t.common.error]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions, refreshTrigger]);

  const openAddDialog = useCallback(() => {
    setEditingPosition(null);
    setFormData({
      symbol: "",
      display: "",
      imageUrl: "",
      location: "bank_one",
      initialPrice: 0,
      initialQuantity: 0,
      initialDate: getTodayIsoDate(),
      initialHasCommission: false,
      initialCommissionAmount: 0,
    });
    lastFetchedSymbolRef.current = null;
    setDialogOpen(true);
  }, []);

  const openTransactionChooser = useCallback(() => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[role="dialog"]')) entryTriggerRef.current = document.activeElement;
    entryTransitionRef.current = dialogOpen || transactionDialogOpen;
    setDialogOpen(false);
    setTransactionDialogOpen(false);
    setHistoryDialogOpen(false);
    setChooserSearch('');
    setChooserOpen(true);
  }, [dialogOpen, transactionDialogOpen]);

  const restoreEntryFocus = (event: Event) => {
    event.preventDefault();
    if (!entryTransitionRef.current) entryTriggerRef.current?.focus();
    entryTransitionRef.current = false;
  };

  useEffect(() => {
    if (add) {
      openTransactionChooser();
      patchUrl({ action: null, view: null });
    }
  }, [add, openTransactionChooser, patchUrl]);

  function openEditDialog(position: Position) {
    if (document.activeElement instanceof HTMLElement) entryTriggerRef.current = document.activeElement;
    setEntryFromChooser(false);
    setEditingPosition(position);
    setFormData({
      symbol: position.symbol,
      display: position.display,
      imageUrl: position.imageUrl,
      location: position.location,
      initialPrice: position.entryPrice,
      initialQuantity: position.quantity,
      initialDate: position.entryDate,
      initialHasCommission: false,
      initialCommissionAmount: 0,
    });
    setDialogOpen(true);
  }

  function openTransactionDialog(
    position: Position,
    type: PositionLotType = "BUY",
  ) {
    if (!entryTransitionRef.current && document.activeElement instanceof HTMLElement && !document.activeElement.closest('[role="dialog"]')) entryTriggerRef.current = document.activeElement;
    setEntryFromChooser(false);
    setHistoryDialogOpen(false);
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
      hasCommission: lot.hasCommission,
      commissionAmount: lot.hasCommission ? lot.commissionAmount : 0,
    });
    setTransactionDialogOpen(true);
  }

  function openHistoryDialog(position: Position) {
    setHistoryTargetId(position.id ?? null);
    setHistoryDialogOpen(true);
  }

  const quickActions = useMemo<DashboardQuickAction[]>(() => {
    const baseActions = createCommonQuickActions(t, {
      overrides: {
        reload: {
          onClick: triggerRefresh,
          disabled: loading,
          iconClassName: loading ? "animate-spin" : undefined,
        },
      },
    });

    return [
      {
        key: "add-position",
        icon: Plus,
        label: locale === "he" ? "הוספת עסקה" : "Add transaction",
        onClick: openTransactionChooser,
        variant: "default",
        className:
          "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
      },
      ...baseActions,
    ];
  }, [t, locale, triggerRefresh, loading, openTransactionChooser]);

  useEffect(() => {
    if (!dialogOpen || isEditing) {
      return;
    }

    const symbol = formData.symbol.trim().toUpperCase();

    if (!symbol) {
      lastFetchedSymbolRef.current = null;
      return;
    }

    if (symbol === lastFetchedSymbolRef.current) {
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(() => {
      void (async () => {
        const price = await fetchQuotePrice(symbol);

        if (cancelled || price === null) {
          return;
        }

        lastFetchedSymbolRef.current = symbol;
        setFormData((previous) => ({
          ...previous,
          initialPrice: price,
        }));
      })();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [dialogOpen, formData.symbol, isEditing]);

  const transactionSymbol =
    transactionTarget?.symbol?.trim().toUpperCase() ?? "";

  useEffect(() => {
    if (!transactionDialogOpen || transactionForm.id || !transactionSymbol) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const price = await fetchQuotePrice(transactionSymbol);

      if (cancelled || price === null) {
        return;
      }

      setTransactionForm((previous) => {
        if (
          previous.id ||
          (typeof previous.price === "number" && previous.price > 0)
        ) {
          return previous;
        }

        return {
          ...previous,
          price,
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [transactionDialogOpen, transactionForm.id, transactionSymbol]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.symbol || !formData.display) {
      toast.error(
        locale === "he" ? "נא למלא את כל השדות" : "Please fill all fields",
      );
      return;
    }

    if (!editingPosition) {
      if (formData.initialPrice <= 0 || formData.initialQuantity <= 0) {
        toast.error(
          locale === "he"
            ? "נדרש מחיר וכמות חיוביים לכניסה"
            : "Positive price and quantity are required",
        );
        return;
      }
      if (formData.initialHasCommission && formData.initialCommissionAmount < 0) {
        toast.error(t.positions.transactionCommissionValidationError);
        return;
      }
    }

    try {
      const supabase = getSupabaseClient();
      if (editingPosition) {
        const { error } = await supabase
          .from("positions")
          .update({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl,
            location: formData.location,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPosition.id);

        if (error) throw error;
        toast.success(
          locale === "he" ? "הפרטים עודכנו" : "Position details updated",
        );
      } else {
        const initialCommissionAmount = formData.initialHasCommission
          ? Math.max(formData.initialCommissionAmount, 0)
          : 0;

        const { data, error } = await supabase
          .from("positions")
          .insert({
            symbol: formData.symbol,
            display: formData.display,
            image_url: formData.imageUrl,
            entry_price: formData.initialPrice,
            quantity: formData.initialQuantity,
            entry_date: formData.initialDate,
            location: formData.location,
          })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          const { error: lotError } = await supabase
            .from("position_lots")
            .insert({
              position_id: data.id,
              side: "BUY",
              price: formData.initialPrice,
              quantity: formData.initialQuantity,
              executed_at: formData.initialDate,
              has_commission: formData.initialHasCommission,
              commission_amount: initialCommissionAmount,
            });

          if (lotError) throw lotError;
        }

        toast.success(locale === "he" ? "הפוזיציה נוספה" : "Position added");
      }

      setDialogOpen(false);
      triggerRefresh();
    } catch (error) {
      console.error("Error saving position:", error);
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
          })
          .eq("id", transactionForm.id);

        if (error) throw error;

        toast.success(t.positions.transactionUpdated);
      } else {
        const { error } = await supabase.from("position_lots").insert({
          position_id: transactionTarget.id,
          side: transactionForm.type,
          price: transactionForm.price,
          quantity: transactionForm.quantity,
          executed_at: transactionForm.executedAt,
          has_commission: transactionForm.hasCommission,
          commission_amount: commissionAmount,
        });

        if (error) throw error;

        toast.success(t.positions.transactionSaved);
      }

      setTransactionDialogOpen(false);
      triggerRefresh();
    } catch (error) {
      console.error("Error saving transaction:", error);
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
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("position_lots")
        .delete()
        .eq("id", lot.id);

      if (error) throw error;

      toast.success(t.positions.transactionDeleted);
      triggerRefresh();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error(t.common.error);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        locale === "he" ? "האם למחוק פוזיציה זו?" : "Delete this position?",
      )
    ) {
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("positions").delete().eq("id", id);

      if (error) throw error;

      toast.success(locale === "he" ? "הפוזיציה נמחקה" : "Position deleted");
      triggerRefresh();
    } catch (error) {
      console.error("Error deleting position:", error);
      toast.error(t.common.error);
    }
  }

  return (
    <DashboardRouteShell activeKey="positions" locale={locale}>
      <DashboardContainer>
        <PageHeader
          title={locale === "he" ? "פעילות" : "Activity"}
          subtitle={locale === "he" ? "ניהול העסקאות וההחזקות שלך במקום אחד." : "Manage your transactions and holdings in one place."}
          icon={Layers}
          metaBadges={headerMetaBadges}
          quickActionsTitle={t.dashboard.quickActions}
          quickActions={quickActions}
        />

        <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} onCloseAutoFocus={restoreEntryFocus} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 px-5 py-6 text-start sm:px-7 sm:text-start">
              <DialogTitle className="text-2xl font-bold text-slate-950">{locale === 'he' ? 'עסקה חדשה' : 'New transaction'}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500">{locale === 'he' ? 'מתחילים פוזיציה חדשה או מעדכנים אחת שכבר בתיק.' : 'Start a new position or update one already in your portfolio.'}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
              <button type="button" onClick={() => { entryTransitionRef.current = true; setChooserOpen(false); setEntryFromChooser(true); openAddDialog(); }} className="group flex w-full items-center gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-start transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Plus aria-hidden="true" className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-slate-950">{locale === 'he' ? 'פוזיציה חדשה' : 'New position'}</span><span className="mt-1 block text-sm text-slate-500">{locale === 'he' ? 'מניה חדשה בתיק, עם פרטי הקנייה הראשונה.' : 'Add a stock with the details of your first purchase.'}</span></span>
                <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600 ltr:rotate-180" />
              </button>
              <div className="mb-3 mt-6"><h2 className="font-semibold text-slate-950">{locale === 'he' ? 'הוספה לפוזיציה קיימת' : 'Add to an existing position'}</h2><p className="mt-1 text-xs text-slate-500">{locale === 'he' ? 'בחרו פוזיציה כדי לרשום קנייה או מכירה.' : 'Choose a position to record a buy or sell.'}</p></div>
              <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="search" value={chooserSearch} onChange={(event) => setChooserSearch(event.target.value)} aria-label={locale === 'he' ? 'חיפוש פוזיציה קיימת' : 'Search existing positions'} placeholder={locale === 'he' ? 'חיפוש לפי סימול או שם מניה' : 'Search by symbol or company'} className="ps-9" /></div>
              {loading && !hasLoaded ? <p role="status" className="py-7 text-center text-sm text-slate-500">{t.common.loading}</p> : loadError && !hasLoaded ? <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>{locale === 'he' ? 'לא הצלחנו לטעון פוזיציות קיימות.' : 'Unable to load existing positions.'}</p><Button variant="outline" size="sm" onClick={loadPositions} className="mt-3">{locale === 'he' ? 'ניסיון חוזר' : 'Try again'}</Button></div> : chooserItems.length ? <>
                {!chooserSearch.trim() ? <p className="mb-1 mt-4 text-xs text-slate-400">{locale === 'he' ? 'פעילות אחרונה' : 'Recent activity'}</p> : null}
                <div className="mt-3 space-y-2.5">{chooserItems.map(({ position }) => (
                  <button
                    key={position.id}
                    type="button"
                    aria-label={`${locale === 'he' ? 'בחירת' : 'Select'} ${position.symbol} · ${position.display} · ${position.location === 'bank_one' ? 'ONE ZERO' : 'Pepper'}`}
                    onClick={() => { entryTransitionRef.current = true; setChooserOpen(false); openTransactionDialog(position); setEntryFromChooser(true); }}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-start shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:gap-4"
                  >
                    <Avatar className="h-12 w-12 shrink-0 rounded-xl border border-slate-100 bg-white shadow-sm">
                      <StockAvatarImage symbol={position.symbol} display={position.display} imageUrl={position.imageUrl} plain className="p-2" />
                      <AvatarFallback className="rounded-xl bg-blue-50 text-sm font-semibold text-blue-700">{position.symbol.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold tracking-tight text-slate-950"><bdi>{position.symbol}</bdi></span>
                      <span className="mt-1 block truncate text-xs leading-5 text-slate-500"><bdi>{position.display}</bdi></span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="flex items-baseline gap-1 text-sm font-semibold tabular-nums text-slate-800"><bdi>{formatNumber(position.quantity, locale)}</bdi><span className="text-[11px] font-normal text-slate-500">{locale === 'he' ? 'מניות' : 'shares'}</span></span>
                      <span dir="ltr" className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide", position.location === 'bank_one' ? 'bg-slate-100 text-slate-600' : 'bg-pink-50 text-pink-700')}>{position.location === 'bank_one' ? 'ONE ZERO' : 'Pepper'}</span>
                    </span>
                    <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-600 ltr:rotate-180" />
                  </button>
                ))}</div>
              </> : <div className="py-7 text-center text-sm text-slate-500"><p>{chooserSearch.trim() ? (locale === 'he' ? 'לא נמצאו פוזיציות שמתאימות לחיפוש.' : 'No positions match your search.') : (locale === 'he' ? 'עדיין אין פוזיציות בתיק. התחילו בפוזיציה חדשה.' : 'No positions yet. Start with a new position.')}</p>{chooserSearch.trim() ? <Button variant="ghost" size="sm" onClick={() => setChooserSearch('')} className="mt-2 text-blue-700">{locale === 'he' ? 'ניקוי החיפוש' : 'Clear search'}</Button> : null}</div>}
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3 sm:px-7"><Button variant="ghost" onClick={() => setChooserOpen(false)}>{t.positions.cancel}</Button></div>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent onCloseAutoFocus={restoreEntryFocus} aria-describedby={undefined} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[color:var(--color-neutral-white)] p-0 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-2xl sm:border">
            <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-5 text-start sm:px-7 sm:text-start">
              {!editingPosition && entryFromChooser ? <Button type="button" variant="ghost" size="sm" onClick={openTransactionChooser} className="mb-2 w-fit gap-2 px-0 text-blue-700"><ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />{locale === 'he' ? 'חזרה לבחירת עסקה' : 'Back to transaction options'}</Button> : null}
              <DialogTitle>
                {editingPosition ? t.positions.edit : (locale === "he" ? "פוזיציה חדשה" : "New position")}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col [&_input]:h-11 sm:[&_input]:h-10">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
                <section className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{locale === "he" ? "פרטי הנכס" : "Asset details"}</p>
                    <p className="mt-1 text-xs text-slate-500">{locale === "he" ? "בחרו סימול — שם החברה והלוגו יתמלאו אוטומטית." : "Choose a symbol to fill the company name and logo automatically."}</p>
                  </div>
                  <PositionAssetPicker
                    locale={locale}
                    value={formData}
                    knownAssets={positions}
                    onChange={(asset) => setFormData((previous) => ({ ...previous, ...asset }))}
                  />
                </section>
              <div>
                <div className="mb-3">
                  <Label>{t.positions.locationLabel}</Label>
                  <p className="mt-1 text-xs text-slate-500">{locale === "he" ? "בחר את החשבון שבו מוחזק הנכס." : "Choose the account that holds this asset."}</p>
                </div>
                <RadioGroup
                  value={formData.location}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      location: value as PositionLocation,
                    })
                  }
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label className={cn(
                    "flex min-h-28 cursor-pointer flex-col justify-between rounded-xl border-2 p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                    formData.location === "bank_one" ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300",
                  )} onClick={() => setFormData((previous) => ({ ...previous, location: "bank_one" }))}>
                    <RadioGroupItem
                      value="bank_one"
                      id="position-location-one"
                      className="sr-only min-h-0 min-w-0"
                    />
                    <BankBadge
                      bank="bank_one"
                      locale={locale}
                      className="self-start"
                    />
                    <span className="text-xs leading-5 text-slate-500">
                      {t.positions.bankOneHelper}
                    </span>
                  </label>
                  <label className={cn(
                    "flex min-h-28 cursor-pointer flex-col justify-between rounded-xl border-2 p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                    formData.location === "bank_two" ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300",
                  )} onClick={() => setFormData((previous) => ({ ...previous, location: "bank_two" }))}>
                    <RadioGroupItem
                      value="bank_two"
                      id="position-location-two"
                      className="sr-only min-h-0 min-w-0"
                    />
                    <BankBadge
                      bank="bank_two"
                      locale={locale}
                      className="self-start"
                    />
                    <span className="text-xs leading-5 text-slate-500">
                      {t.positions.bankTwoHelper}
                    </span>
                  </label>
                </RadioGroup>
              </div>
              {isEditing && editingPosition ? (
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-700">
                    {t.positions.currentHolding}
                  </p>
                  <p className="mt-2">
                    {formatNumber(editingPosition.quantity, locale)} ·{" "}
                    {formatCurrency(editingPosition.entryPrice, "USD", locale)}{" "}
                    • {formatDate(editingPosition.entryDate, locale)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.positions.since}{" "}
                    {formatDate(editingPosition.entryDate, locale)}
                  </p>
                </section>
              ) : (
                <section className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{locale === "he" ? "רכישה ראשונה" : "Initial purchase"}</p>
                    <p className="mt-1 text-xs text-slate-500">{locale === "he" ? "הפרטים של הפעולה הראשונה בפוזיציה." : "Details for the first transaction in this position."}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <Label htmlFor="initialPrice">{t.positions.initialPrice}</Label>
                      <Input
                        id="initialPrice"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          Number.isFinite(formData.initialPrice)
                            ? formData.initialPrice
                            : 0
                        }
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
                      <Label htmlFor="initialQuantity">
                        {t.positions.initialQuantity}
                      </Label>
                      <Input
                        id="initialQuantity"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          Number.isFinite(formData.initialQuantity)
                            ? formData.initialQuantity
                            : 0
                        }
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
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            initialDate: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label
                          htmlFor="initial-commission-toggle"
                          className="text-sm font-medium"
                        >
                          {t.positions.transactionCommissionToggle}
                        </Label>
                        <p className="text-xs text-slate-500">
                          {t.positions.transactionCommissionHelper}
                        </p>
                      </div>
                      <Switch
                        id="initial-commission-toggle"
                        checked={formData.initialHasCommission}
                        onCheckedChange={(checked) =>
                          setFormData((previous) => ({
                            ...previous,
                            initialHasCommission: checked,
                            initialCommissionAmount: checked
                              ? previous.initialCommissionAmount > 0
                                ? previous.initialCommissionAmount
                                : DEFAULT_COMMISSION_USD
                              : 0,
                          }))
                        }
                      />
                    </div>
                    {formData.initialHasCommission && <div className="mt-4 border-t border-slate-200 pt-4">
                      <Label htmlFor="initial-commission-amount">
                        {t.positions.transactionCommissionAmount}
                      </Label>
                      <Input
                        id="initial-commission-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.initialCommissionAmount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            initialCommissionAmount:
                              Number.parseFloat(e.target.value) || 0,
                          })
                        }
                        disabled={!formData.initialHasCommission}
                        required={formData.initialHasCommission}
                      />
                    </div>}
                  </div>
                </section>
              )}
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => setDialogOpen(false)}>
                  {t.positions.cancel}
                </Button>
                <Button type="submit" className="h-11 sm:h-10">{t.positions.save}</Button>
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
          <DialogContent onCloseAutoFocus={restoreEntryFocus} aria-describedby={undefined} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-2xl sm:border">
            <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-5 text-start sm:px-7 sm:text-start">
              {!isEditingTransaction ? <Button type="button" variant="ghost" size="sm" onClick={openTransactionChooser} className="mb-2 w-fit gap-2 px-0 text-blue-700"><ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />{locale === 'he' ? 'בחירת פוזיציה אחרת' : 'Change position'}</Button> : null}
              <DialogTitle>
                {isEditingTransaction
                  ? t.positions.editTransaction
                  : t.positions.addTransaction}
              </DialogTitle>
              {transactionTarget ? <p className="mt-2 text-sm text-slate-500"><bdi className="font-semibold text-slate-800">{transactionTarget.symbol}</bdi> · {transactionTarget.display} · {transactionTarget.location === 'bank_one' ? 'ONE ZERO' : 'Pepper'}</p> : null}
            </DialogHeader>
            <form onSubmit={handleTransactionSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 [&_input]:h-11 sm:px-7 [&_input]:sm:h-10">
              <section className="space-y-3">
                <div>
                  <Label>{t.positions.transactionType}</Label>
                  <p className="mt-1 text-xs text-slate-500">{locale === "he" ? "בחר את הפעולה שמתבצעת כעת." : "Choose the action you are recording."}</p>
                </div>
                <RadioGroup
                  value={transactionForm.type}
                  onValueChange={(value) =>
                    setTransactionForm({
                      ...transactionForm,
                      type: value as PositionLotType,
                    })
                  }
                  className="grid grid-cols-2 gap-3"
                >
                  <label className={cn("flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring", transactionForm.type === "BUY" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")} onClick={() => setTransactionForm((previous) => ({ ...previous, type: "BUY" }))}>
                    <RadioGroupItem value="BUY" id="transaction-buy" className="sr-only min-h-0 min-w-0" />
                    {t.positions.buy}
                  </label>
                  <label className={cn("flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring", transactionForm.type === "SELL" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")} onClick={() => setTransactionForm((previous) => ({ ...previous, type: "SELL" }))}>
                    <RadioGroupItem value="SELL" id="transaction-sell" className="sr-only min-h-0 min-w-0" />
                    {t.positions.sell}
                  </label>
                </RadioGroup>
              </section>
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
                  <Label htmlFor="transactionQuantity">
                    {t.positions.transactionQuantity}
                  </Label>
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
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="transactionDate">
                    {t.positions.transactionDate}
                  </Label>
                  <Input
                    id="transactionDate"
                    type="date"
                    value={transactionForm.executedAt}
                    onChange={(e) =>
                      setTransactionForm({
                        ...transactionForm,
                        executedAt: e.target.value,
                      })
                    }
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
                        commissionAmount: checked
                          ? previous.commissionAmount > 0
                            ? previous.commissionAmount
                            : DEFAULT_COMMISSION_USD
                          : 0,
                      }))
                    }
                  />
                </div>
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
                  onClick={() => setTransactionDialogOpen(false)}
                >
                  {t.positions.cancel}
                </Button>
                <Button type="submit" className="h-11 sm:h-10">{t.positions.saveTransaction}</Button>
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
          <DialogContent aria-describedby={undefined} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-xl sm:rounded-2xl sm:border">
            <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-5 text-start sm:px-7 sm:text-start">
              <DialogTitle>{t.positions.manageHistory}</DialogTitle>
              {historyTarget && (
                <p className="text-sm text-slate-500">
                  {historyTarget.display} · {historyTarget.symbol}
                </p>
              )}
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {historyTarget ? (
              historyTarget.lots && historyTarget.lots.length > 0 ? (
                <div className="space-y-3">
                  {[...(historyTarget.lots ?? [])]
                    .sort((a, b) => {
                      const aTime = new Date(a.executedAt).getTime();
                      const bTime = new Date(b.executedAt).getTime();
                      return Number.isNaN(bTime) || Number.isNaN(aTime)
                        ? 0
                        : bTime - aTime;
                    })
                    .map((lot) => {
                      const typeLabel =
                        lot.type === "BUY" ? t.positions.buy : t.positions.sell;
                      const badgeTone =
                        lot.type === "BUY"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700";
                      const commissionApplied =
                        lot.hasCommission && lot.commissionAmount > 0;
                      const commissionLabel = commissionApplied
                        ? t.positions.transactionCommissionApplied(
                            formatCurrency(lot.commissionAmount, "USD", locale),
                          )
                        : t.positions.transactionCommissionWaived;

                      return (
                        <div
                          key={`${lot.id}-${lot.executedAt}`}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeTone}`}>
                              {typeLabel}
                            </span>
                            <div className="min-w-0 text-sm text-slate-700">
                              <p className="font-medium">
                                {formatNumber(lot.quantity, locale)} · {formatCurrency(lot.price, "USD", locale)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{formatDate(lot.executedAt, locale)} · {commissionLabel}</p>
                            </div>
                          </div>
                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 flex-1 border border-slate-200 bg-white sm:w-10 sm:flex-none"
                              onClick={() =>
                                historyTarget &&
                                openEditTransactionDialog(historyTarget, lot)
                              }
                              aria-label={t.positions.editTransaction}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 flex-1 border border-slate-200 bg-white sm:w-10 sm:flex-none"
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
                <p className="text-sm text-slate-500">
                  {t.positions.noTransactions}
                </p>
              )
            ) : (
              <p className="text-sm text-slate-500">{t.common.loading}</p>
            )}
            </div>
            {historyTarget && (
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
              <Button
                className="h-11 w-full sm:h-10"
                onClick={() => openTransactionDialog(historyTarget)}
              >
                <Plus className="h-4 w-4" />
                {t.positions.addTransaction}
              </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <DashboardMain>
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-5">
            <div className="relative z-10">
              {loadError ? (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <span>{locale === "he" ? (hasLoaded ? "הרענון נכשל. הנתונים האחרונים נשמרו." : "לא הצלחנו לטעון את הפוזיציות.") : (hasLoaded ? "Refresh failed. Showing the last available data." : "Unable to load positions.")}</span>
                  <Button variant="outline" onClick={loadPositions} disabled={loading}>{locale === "he" ? "ניסיון חוזר" : "Try again"}</Button>
                </div>
              ) : null}
              {loading && hasLoaded ? <p role="status" className="mb-3 text-xs text-slate-500">{locale === "he" ? "מעדכן נתונים…" : "Updating data…"}</p> : null}
              {loading && !hasLoaded ? (
                <Card>
                  <CardContent className="space-y-4 py-8" aria-label={t.common.loading} aria-busy="true">
                    {[0, 1, 2].map((row) => <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}
                  </CardContent>
                </Card>
              ) : !hasLoaded && loadError ? null : positions.length === 0 ? (
                <Card className="border border-dashed border-slate-300 bg-[color:var(--color-neutral-white)]/60 text-center shadow-none backdrop-blur">
                  <CardContent className="flex flex-col items-center gap-4 py-12">
                    <p className="text-base font-semibold text-slate-700">
                      {t.dashboard.noPositions}
                    </p>
                    <p className="max-w-sm text-sm text-slate-500">
                      {t.positions.emptyStateDescription}
                    </p>
                    <Button onClick={openTransactionChooser} className="gap-2">
                      <Plus className="h-4 w-4" />
                      {t.positions.add}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card className="border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/90 shadow-sm">
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="grid gap-3 lg:grid-cols-12">
                        <div className="relative lg:col-span-5">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t.positions.searchPlaceholder}
                            className="pl-9"
                          />
                        </div>
                        <div className="lg:col-span-3">
                          <Select
                            value={locationFilter}
                            onValueChange={(value) =>
                              setLocationFilter(value as PositionLocationFilter)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t.positions.filterByBank} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                {t.positions.filterAllBanks}
                              </SelectItem>
                              <SelectItem value="bank_one">
                                {t.positions.filterBankOne}
                              </SelectItem>
                              <SelectItem value="bank_two">
                                {t.positions.filterBankTwo}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="lg:col-span-3">
                          <Select
                            value={sortOption}
                            onValueChange={(value) =>
                              setSortOption(value as PositionSortOption)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t.positions.sortBy} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="latest_activity">
                                {t.positions.sortLatestActivity}
                              </SelectItem>
                              <SelectItem value="symbol_asc">
                                {t.positions.sortSymbolAsc}
                              </SelectItem>
                              <SelectItem value="symbol_desc">
                                {t.positions.sortSymbolDesc}
                              </SelectItem>
                              <SelectItem value="quantity_desc">
                                {t.positions.sortQuantityDesc}
                              </SelectItem>
                              <SelectItem value="entry_date_desc">
                                {t.positions.sortEntryDateDesc}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="lg:col-span-1">
                          <Select
                            value={String(pageSize)}
                            onValueChange={(value) =>
                              setPageSize(Number.parseInt(value, 10))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t.positions.pageSizeLabel} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {t.positions.filteredResultCount(
                            filteredPositionItems.length,
                            positions.length,
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            {t.positions.rangeSummary(
                              displayFrom,
                              displayTo,
                              filteredPositionItems.length,
                            )}
                          </span>
                          {hasActiveFilters && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setSearchTerm("");
                                setLocationFilter("all");
                              }}
                            >
                              {t.positions.clearFilters}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {filteredPositionItems.length === 0 ? (
                    <Card className="border border-dashed border-slate-300 bg-[color:var(--color-neutral-white)]/70 shadow-none">
                      <CardContent className="py-12 text-center">
                        <p className="text-sm font-medium text-slate-700">
                          {t.positions.noFilteredResults}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
                        <Table className="min-w-[860px]">
                          <TableHeader className="bg-slate-50/90">
                            <TableRow className="hover:bg-slate-50/90">
                              <TableHead>{t.positions.columnAsset}</TableHead>
                              <TableHead className="text-right">
                                {t.positions.quantity}
                              </TableHead>
                              <TableHead className="text-right">
                                {t.positions.entryPrice}
                              </TableHead>
                              <TableHead>{t.positions.entryDate}</TableHead>
                              <TableHead>{t.positions.lastActivity}</TableHead>
                              <TableHead>{t.positions.transactionsTitle}</TableHead>
                              <TableHead className="text-right">
                                {t.positions.columnActions}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedPositionItems.map((item) => {
                              const { position, sortedLots, recentLots } = item;

                              return (
                                <TableRow
                                  key={position.id ?? `${position.symbol}-${position.entryDate}`}
                                  className="hover:bg-slate-50/60"
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-10 w-10 border border-slate-200 bg-slate-50">
                                        <StockAvatarImage
                                          symbol={position.symbol}
                                          display={`${position.display} logo`}
                                          imageUrl={position.imageUrl}
                                        />
                                        <AvatarFallback className="text-xs font-medium text-slate-600">
                                          {item.fallbackInitials}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                          {position.display}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                          <Badge className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                            {position.symbol}
                                          </Badge>
                                          <BankBadge
                                            bank={
                                              position.location === "bank_two"
                                                ? "bank_two"
                                                : "bank_one"
                                            }
                                            locale={locale}
                                            size="sm"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-slate-700">
                                    {formatNumber(position.quantity, locale)}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-slate-700">
                                    {formatCurrency(position.entryPrice, "USD", locale)}
                                  </TableCell>
                                  <TableCell className="text-slate-600">
                                    {formatDate(position.entryDate, locale)}
                                  </TableCell>
                                  <TableCell className="text-slate-600">
                                    {formatDate(item.lastActivityDate, locale)}
                                  </TableCell>
                                  <TableCell>
                                    {sortedLots.length > 0 ? (
                                      <div className="space-y-1">
                                        <p className="text-xs text-slate-500">
                                          {t.positions.transactionCount(sortedLots.length)}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {recentLots.map((lot) => (
                                            <span
                                              key={`${lot.id}-${lot.executedAt}`}
                                              className={cn(
                                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                                lot.type === "BUY"
                                                  ? "bg-emerald-50 text-emerald-700"
                                                  : "bg-rose-50 text-rose-700",
                                              )}
                                            >
                                              {lot.type === "BUY"
                                                ? t.positions.buy
                                                : t.positions.sell}{" "}
                                              · {formatDate(lot.executedAt, locale)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        {t.positions.noTransactions}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                      <Button asChild variant="ghost" size="icon" className="shrink-0 rounded-full text-slate-500 hover:text-slate-800">
                                        <Link href={buildStockHref(position.symbol, sourceUrl || "/positions")}
                                          id={`position-link-${position.id ?? position.symbol}`}
                                          onClick={() => rememberReturnContext(`position-link-${position.id ?? position.symbol}`)}
                                          aria-label={t.dashboard.viewDetails}>
                                          <BarChart3 aria-hidden="true" className="h-4 w-4" />
                                        </Link>
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openTransactionDialog(position)}
                                        aria-label={t.positions.addTransaction}
                                        className="h-8 w-8 rounded-full text-slate-500 hover:text-slate-800"
                                      >
                                        <ArrowRightLeft className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openHistoryDialog(position)}
                                        aria-label={t.positions.manageHistory}
                                        className="h-8 w-8 rounded-full text-slate-500 hover:text-slate-800"
                                      >
                                        <History className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditDialog(position)}
                                        aria-label={t.positions.edit}
                                        className="h-8 w-8 rounded-full text-slate-500 hover:text-slate-800"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          position.id && handleDelete(position.id)
                                        }
                                        aria-label={t.positions.delete}
                                        disabled={!position.id}
                                        className="h-8 w-8 rounded-full text-rose-500 hover:text-rose-600 disabled:text-slate-300"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="min-w-0 space-y-3 overflow-hidden lg:hidden">
                        {paginatedPositionItems.map((item) => {
                          const { position, sortedLots, recentLots } = item;

                          return (
                            <Card
                              key={position.id ?? `${position.symbol}-${position.entryDate}`}
                              className="min-w-0 max-w-full overflow-hidden border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/95 shadow-sm"
                            >
                              <CardHeader className="min-w-0 space-y-3 pb-3">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <Avatar className="h-11 w-11 border border-slate-200 bg-slate-50">
                                      <StockAvatarImage
                                        symbol={position.symbol}
                                        display={`${position.display} logo`}
                                        imageUrl={position.imageUrl}
                                      />
                                      <AvatarFallback className="text-xs font-medium text-slate-600">
                                        {item.fallbackInitials}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">
                                        {position.display}
                                      </p>
                                      <div className="mt-1 flex items-center gap-2">
                                        <Badge className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                          {position.symbol}
                                        </Badge>
                                        <BankBadge
                                          bank={
                                            position.location === "bank_two"
                                              ? "bank_two"
                                              : "bank_one"
                                          }
                                          locale={locale}
                                          size="sm"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <Button asChild variant="ghost" size="icon" className="rounded-full text-slate-500 hover:text-slate-800">
                                    <Link href={buildStockHref(position.symbol, sourceUrl || "/positions")}
                                      id={`position-mobile-link-${position.id ?? position.symbol}`}
                                      onClick={() => rememberReturnContext(`position-mobile-link-${position.id ?? position.symbol}`)}
                                      aria-label={t.dashboard.viewDetails}>
                                      <BarChart3 aria-hidden="true" className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </div>
                                <div className="grid min-w-0 grid-cols-2 gap-2 text-xs text-slate-600">
                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                                    <p className="text-[11px] text-slate-500">
                                      {t.positions.quantity}
                                    </p>
                                    <p className="mt-0.5 break-words font-semibold text-slate-800">
                                      {formatNumber(position.quantity, locale)}
                                    </p>
                                  </div>
                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                                    <p className="text-[11px] text-slate-500">
                                      {t.positions.entryPrice}
                                    </p>
                                    <p className="mt-0.5 break-words font-semibold text-slate-800">
                                      {formatCurrency(position.entryPrice, "USD", locale)}
                                    </p>
                                  </div>
                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                                    <p className="text-[11px] text-slate-500">
                                      {t.positions.entryDate}
                                    </p>
                                    <p className="mt-0.5 break-words font-semibold text-slate-800">
                                      {formatDate(position.entryDate, locale)}
                                    </p>
                                  </div>
                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                                    <p className="text-[11px] text-slate-500">
                                      {t.positions.lastActivity}
                                    </p>
                                    <p className="mt-0.5 break-words font-semibold text-slate-800">
                                      {formatDate(item.lastActivityDate, locale)}
                                    </p>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3 pt-0">
                                <div>
                                  <p className="text-xs text-slate-500">
                                    {sortedLots.length > 0
                                      ? t.positions.transactionCount(sortedLots.length)
                                      : t.positions.noTransactions}
                                  </p>
                                  {recentLots.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {recentLots.map((lot) => (
                                        <span
                                          key={`${lot.id}-${lot.executedAt}`}
                                          className={cn(
                                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                            lot.type === "BUY"
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-rose-50 text-rose-700",
                                          )}
                                        >
                                          {lot.type === "BUY"
                                            ? t.positions.buy
                                            : t.positions.sell}{" "}
                                          · {formatDate(lot.executedAt, locale)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openTransactionDialog(position)}
                                    className="!h-auto !min-h-9 w-full min-w-0 !whitespace-normal px-2 py-2 text-xs leading-tight"
                                  >
                                    {t.positions.addTransaction}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openHistoryDialog(position)}
                                    className="!h-auto !min-h-9 w-full min-w-0 !whitespace-normal px-2 py-2 text-xs leading-tight"
                                  >
                                    {t.positions.manageHistory}
                                  </Button>
                                  <div className="flex items-center justify-end gap-1 min-[360px]:col-span-2 sm:col-span-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditDialog(position)}
                                      aria-label={t.positions.edit}
                                      className="h-8 w-8 rounded-full text-slate-500 hover:text-slate-800"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        position.id && handleDelete(position.id)
                                      }
                                      aria-label={t.positions.delete}
                                      disabled={!position.id}
                                      className="h-8 w-8 rounded-full text-rose-500 hover:text-rose-600 disabled:text-slate-300"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/80 px-3 py-2 text-xs text-slate-500">
                        <span>
                          {t.positions.pageIndicator(currentPage, totalPages)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={currentPage <= 1}
                            onClick={() =>
                              setCurrentPage((previous) => Math.max(1, previous - 1))
                            }
                            aria-label={t.positions.previousPage}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={currentPage >= totalPages}
                            onClick={() =>
                              setCurrentPage((previous) =>
                                Math.min(totalPages, previous + 1),
                              )
                            }
                            aria-label={t.positions.nextPage}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
