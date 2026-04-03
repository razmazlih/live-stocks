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
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { createCommonQuickActions } from "@/components/dashboard/common-quick-actions";
import type { DashboardQuickAction } from "@/components/dashboard/quick-actions";
import {
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  ArrowRightLeft,
  History,
  Clock3,
  Layers,
  Package,
  CalendarClock,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import {
  cardShellClass,
  chipShellClass,
  controlLabelClass,
  dialogActionButtonClass,
  dialogFooterClass,
  dialogSectionClass,
  dialogShellClass,
  historyDialogShellClass,
  panelLabelClass,
  rowActionButtonClass,
  sectionShellClass,
  toolbarCardClass,
} from "@/features/positions/page-styles";
import type {
  PositionFormData,
  PositionLocationFilter,
  PositionSortOption,
  TransactionFormData,
} from "@/features/positions/page-types";
import {
  createDefaultTransactionForm,
  fetchQuotePrice,
  getTodayIsoDate,
} from "@/features/positions/page-utils";
import {
  buildPositionItems,
  filterAndSortPositionItems,
} from "@/features/positions/selectors";

export default function PositionsPage() {
  const { locale, triggerRefresh, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<PositionFormData>({
    symbol: "",
    display: "",
    imageUrl: "",
    location: "bank_one",
    initialPrice: 0,
    initialQuantity: 0,
    initialDate: getTodayIsoDate(),
    initialHasCommission: true,
    initialCommissionAmount: DEFAULT_COMMISSION_USD,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] =
    useState<PositionLocationFilter>("all");
  const [sortOption, setSortOption] =
    useState<PositionSortOption>("latest_activity");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const lastFetchedSymbolRef = useRef<string | null>(null);
  const isEditing = Boolean(editingPosition);
  const isEditingTransaction = Boolean(transactionForm.id);
  const isRtl = locale === "he";
  const searchIconClassName = isRtl ? "right-3" : "left-3";

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

  const positionItems = useMemo(
    () => buildPositionItems(positions),
    [positions],
  );

  const filteredPositionItems = useMemo(
    () =>
      filterAndSortPositionItems(positionItems, {
        searchTerm,
        locationFilter,
        sortOption,
      }),
    [locationFilter, positionItems, searchTerm, sortOption],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, locationFilter, sortOption, pageSize]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPositionItems.length / pageSize)),
    [filteredPositionItems.length, pageSize],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedPositionItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPositionItems.slice(start, start + pageSize);
  }, [currentPage, filteredPositionItems, pageSize]);

  const hasActiveFilters = Boolean(searchTerm.trim()) || locationFilter !== "all";
  const displayFrom =
    filteredPositionItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const displayTo = Math.min(currentPage * pageSize, filteredPositionItems.length);
  const totalTransactionCount = useMemo(
    () =>
      positions.reduce(
        (sum, position) => sum + (position.lots?.length ?? 0),
        0,
      ),
    [positions],
  );

  const prioritySignals = useMemo(() => {
    if (positionItems.length === 0) {
      return [];
    }

    const sortedByActivity = [...positionItems].sort(
      (a, b) =>
        b.lastActivityTimestamp - a.lastActivityTimestamp ||
        a.position.symbol.localeCompare(b.position.symbol),
    );
    const sortedByQuantity = [...positionItems].sort(
      (a, b) =>
        b.position.quantity - a.position.quantity ||
        a.position.symbol.localeCompare(b.position.symbol),
    );
    const sortedByTrades = [...positionItems].sort(
      (a, b) =>
        b.sortedLots.length - a.sortedLots.length ||
        b.lastActivityTimestamp - a.lastActivityTimestamp ||
        a.position.symbol.localeCompare(b.position.symbol),
    );

    const mostRecent = sortedByActivity[0];
    const largestHolding = sortedByQuantity[0];
    const busiestHolding = sortedByTrades[0];

    return [
      {
        key: "recent",
        icon: Clock3,
        label: locale === "he" ? "פעילות אחרונה" : "Latest activity",
        value: mostRecent.position.symbol,
        helper: formatDate(mostRecent.lastActivityDate, locale),
      },
      {
        key: "largest",
        icon: Package,
        label: locale === "he" ? "החזקה הגדולה" : "Largest holding",
        value: largestHolding.position.symbol,
        helper: formatNumber(largestHolding.position.quantity, locale),
      },
      {
        key: "busiest",
        icon: ArrowRightLeft,
        label: locale === "he" ? "הכי פעיל" : "Most transactions",
        value: busiestHolding.position.symbol,
        helper:
          busiestHolding.sortedLots.length > 0
            ? t.positions.transactionCount(busiestHolding.sortedLots.length)
            : t.positions.noTransactions,
      },
    ];
  }, [locale, positionItems, t.positions]);

  const overviewStats = [
    {
      key: "positions",
      label: t.positions.overviewActivePositions,
      value: formatNumber(positions.length, locale),
      icon: Layers,
      tone: "bg-[color:var(--color-slate-50)]",
    },
    {
      key: "quantity",
      label: t.positions.overviewTotalQuantity,
      value: formatNumber(totalQuantity, locale),
      icon: Package,
      tone: "bg-[color:var(--color-slate-50)]",
    },
    {
      key: "transactions",
      label: locale === "he" ? "עסקאות" : "Transactions",
      value: formatNumber(totalTransactionCount, locale),
      icon: ArrowRightLeft,
      tone: "bg-[color:var(--color-slate-50)]",
    },
    {
      key: "tracked",
      label: locale === "he" ? "עם היסטוריה" : "With history",
      value: formatNumber(
        positionItems.filter((item) => item.sortedLots.length > 0).length,
        locale,
      ),
      icon: History,
      tone: "bg-[color:var(--color-slate-50)]",
    },
  ];

  const headerMetaBadges = [
    {
      key: "positions",
      icon: Layers,
      label: `${t.positions.overviewActivePositions}: ${formatNumber(positions.length, locale)}`,
      className:
        "bg-[color:var(--color-slate-50)] text-[var(--color-primary-700)] shadow-sm",
      iconClassName: "text-[var(--color-primary-500)]",
    },
    {
      key: "quantity",
      icon: CalendarClock,
      label: `${t.positions.overviewTotalQuantity}: ${formatNumber(totalQuantity, locale)}`,
      className:
        "bg-[color:var(--color-slate-50)] text-[var(--color-emerald-700)] shadow-sm",
      iconClassName: "text-[var(--color-emerald-500)]",
    },
    {
      key: "transactions",
      icon: ArrowRightLeft,
      label: `${locale === "he" ? "עסקאות" : "Transactions"}: ${formatNumber(totalTransactionCount, locale)}`,
      className:
        "bg-[color:var(--color-slate-50)] text-[var(--color-amber-700)] shadow-sm",
      iconClassName: "text-[var(--color-amber-500)]",
    },
  ];

  const positionsPageCopy =
    locale === "he"
      ? {
          heroKicker: "מרכז שליטת פוזיציות",
          heroTagline:
            "ריכוז חד של החשיפות הפעילות, קצב הפעילות, והפעולות שצריך לבצע בלי לאבד הקשר.",
          spotlightLabel: "אותות מובילים",
          workspaceTitle: "מרחב ניהול",
          workspaceSubtitle:
            "סינון, מיון ופעולות מהירות על כל הפוזיציות הפעילות במקום אחד.",
          filtersLabel: "פילטרים פעילים",
          noFiltersLabel: "אין פילטרים פעילים",
          resultsLabel: "תצוגת רשימה",
          historySummary: "ציר עסקאות",
        }
      : {
          heroKicker: "Positions command center",
          heroTagline:
            "A sharper read on active exposure, activity cadence, and the actions worth taking next without losing context.",
          spotlightLabel: "Lead signals",
          workspaceTitle: "Management workspace",
          workspaceSubtitle:
            "Filter, sort, and act on every tracked position from one focused surface.",
          filtersLabel: "Active filters",
          noFiltersLabel: "No active filters",
          resultsLabel: "List view",
          historySummary: "Transaction timeline",
        };

  const activeFilterCount =
    Number(Boolean(searchTerm.trim())) + Number(locationFilter !== "all");

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("positions")
        .select("*, position_lots(*)")
        .order("symbol");

      if (error) throw error;

      const mappedPositions: Position[] = (data || []).map(mapPositionRow);
      setPositions(mappedPositions);
    } catch (error) {
      console.error("Error loading positions:", error);
      toast.error(t.common.error);
    } finally {
      setLoading(false);
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
      initialHasCommission: true,
      initialCommissionAmount: DEFAULT_COMMISSION_USD,
    });
    lastFetchedSymbolRef.current = null;
    setDialogOpen(true);
  }, []);

  function openEditDialog(position: Position) {
    setEditingPosition(position);
    setFormData({
      symbol: position.symbol,
      display: position.display,
      imageUrl: position.imageUrl,
      location: position.location,
      initialPrice: position.entryPrice,
      initialQuantity: position.quantity,
      initialDate: position.entryDate,
      initialHasCommission: true,
      initialCommissionAmount: DEFAULT_COMMISSION_USD,
    });
    setDialogOpen(true);
  }

  function openTransactionDialog(
    position: Position,
    type: PositionLotType = "BUY",
  ) {
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
      include: ["reload"],
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
        label: t.positions.add,
        onClick: openAddDialog,
        className:
          "bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] text-[var(--color-neutral-white)] shadow-[0_18px_34px_-22px_rgba(37,99,235,0.72)] hover:bg-[var(--color-primary-650)] hover:shadow-[0_22px_40px_-22px_rgba(37,99,235,0.76)]",
      },
      ...baseActions,
    ];
  }, [t, triggerRefresh, loading, openAddDialog]);

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
            image_url:
              formData.imageUrl ||
              `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
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
            image_url:
              formData.imageUrl ||
              `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
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
      loadPositions();
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
      loadPositions();
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
      await loadPositions();
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
      loadPositions();
      triggerRefresh();
    } catch (error) {
      console.error("Error deleting position:", error);
      toast.error(t.common.error);
    }
  }

  return (
    <DashboardPageShell direction={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className={`${sectionShellClass} px-5 py-5 sm:px-6 sm:py-6`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_88%_16%,rgba(16,185,129,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_46%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.95),rgba(255,255,255,0))]"
          />
          <div className="relative z-10 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="rounded-[22px] border border-[color:var(--color-blue-100)]/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(239,246,255,0.84))] p-3 text-[var(--color-primary-600)] shadow-[0_18px_30px_-24px_rgba(37,99,235,0.75)]">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-[0_14px_24px_-20px_rgba(37,99,235,0.65)]">
                    <Layers className="h-3.5 w-3.5" />
                    {positionsPageCopy.heroKicker}
                  </span>
                  <h1 className="text-2xl font-black tracking-tight text-[var(--color-primary-900)] sm:text-3xl lg:text-[2.2rem]">
                    {t.positions.title}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                    {t.positions.subtitle}
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--color-slate-500)]">
                    {positionsPageCopy.heroTagline}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:text-sm">
                {headerMetaBadges.map((badge) => {
                  const Icon = badge.icon;
                  return (
                    <span
                      key={badge.key}
                      className={cn(
                        chipShellClass,
                        badge.className,
                      )}
                    >
                      <Icon className={cn("h-4 w-4", badge.iconClassName)} />
                      <span>{badge.label}</span>
                    </span>
                  );
                })}
              </div>
              {prioritySignals.length > 0 && (
                <div className="rounded-[28px] border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.7)] p-3 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.44)] backdrop-blur-sm sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                      {positionsPageCopy.spotlightLabel}
                    </p>
                    <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(248,250,252,0.92)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                      {formatNumber(prioritySignals.length, locale)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {prioritySignals.map((signal) => {
                    const Icon = signal.icon;

                    return (
                      <div
                        key={signal.key}
                        className="relative overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_18px_30px_-28px_rgba(15,23,42,0.38)]"
                      >
                        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.75),rgba(59,130,246,0))]" />
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.92)] text-[var(--color-primary-600)] shadow-[0_14px_22px_-18px_rgba(37,99,235,0.72)]">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span>{signal.label}</span>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-base font-semibold tracking-tight text-[var(--color-primary-900)]">
                            {signal.value}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-slate-500)]">
                          {signal.helper}
                        </p>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
            <QuickActionsSection
              title={t.dashboard.quickActions}
              actions={quickActions}
              className="lg:sticky lg:top-6 lg:self-start"
            >
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-5 text-[var(--color-slate-500)]">
                  {t.positions.quickActionsDescription}
                </p>
                <div className="rounded-[22px] border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.76)] px-3.5 py-3 text-xs leading-5 text-[var(--color-slate-600)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {positionsPageCopy.resultsLabel}
                  </span>
                  <span className="mt-1 block">
                    {t.positions.filteredResultCount(
                      filteredPositionItems.length,
                      positions.length,
                    )}
                  </span>
                </div>
              </div>
            </QuickActionsSection>
          </div>
        </header>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className={dialogShellClass}>
            <DialogHeader className="border-b border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] px-5 py-4 sm:px-6">
              <DialogTitle className="text-lg font-bold tracking-tight text-[var(--color-primary-900)] sm:text-xl">
                {editingPosition ? t.positions.edit : t.positions.add}
              </DialogTitle>
              <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                {editingPosition
                  ? locale === "he"
                    ? "עדכון פרטי הפוזיציה והיתרות הקיימות."
                    : "Update the position details and current holdings."
                  : locale === "he"
                    ? "יצירת פוזיציה חדשה עם פרטי כניסה מלאים."
                    : "Create a new position with full entry details."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                  {editingPosition ? t.positions.edit : t.positions.add}
                </span>
                <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.9)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                  {formData.location === "bank_two"
                    ? t.positions.filterBankTwo
                    : t.positions.filterBankOne}
                </span>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <div className={dialogSectionClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={panelLabelClass}>
                        {locale === "he" ? "פרטי זיהוי" : "Identity details"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-slate-500)]">
                        {locale === "he"
                          ? "הזן את הסמל, השם והלוגו כך שהפוזיציה תהיה קלה לזיהוי."
                          : "Enter the symbol, display name, and logo so the position is easy to identify."}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="symbol">{t.positions.symbol}</Label>
                      <Input
                        id="symbol"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                        value={formData.symbol}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            symbol: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="AAPL"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="display">{t.positions.display}</Label>
                      <Input
                        id="display"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                        value={formData.display}
                        onChange={(e) =>
                          setFormData({ ...formData, display: e.target.value })
                        }
                        placeholder="Apple Inc."
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="imageUrl">{t.positions.imageUrl}</Label>
                      <Input
                        id="imageUrl"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                        value={formData.imageUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, imageUrl: e.target.value })
                        }
                        placeholder="https://logo.clearbit.com/apple.com"
                      />
                    </div>
                  </div>
                </div>

                <div className={dialogSectionClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className={panelLabelClass}>
                        {t.positions.locationLabel}
                      </Label>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-slate-500)]">
                        {locale === "he"
                          ? "בחר היכן הפוזיציה נשמרת כדי לשמור על היסטוריה ברורה."
                          : "Choose where the position is tracked so history stays easy to scan."}
                      </p>
                    </div>
                  </div>
                  <RadioGroup
                    value={formData.location}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        location: value as PositionLocation,
                      })
                    }
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <label
                      className={cn(
                        "flex min-w-0 flex-col gap-1 rounded-2xl border p-4 text-sm shadow-sm transition",
                        formData.location === "bank_one"
                          ? "border-[color:var(--color-blue-200)] bg-[rgba(239,246,255,0.86)] text-[var(--color-primary-700)] shadow-[0_18px_28px_-22px_rgba(37,99,235,0.48)]"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-600)]",
                      )}
                    >
                      <RadioGroupItem
                        value="bank_one"
                        id="position-location-one"
                        className="order-[-1]"
                      />
                      <BankBadge
                        bank="bank_one"
                        locale={locale}
                        className="mt-1 self-start"
                      />
                      <span className="text-xs leading-5 text-[var(--color-slate-500)]">
                        {t.positions.bankOneHelper}
                      </span>
                    </label>
                    <label
                      className={cn(
                        "flex min-w-0 flex-col gap-1 rounded-2xl border p-4 text-sm shadow-sm transition",
                        formData.location === "bank_two"
                          ? "border-[color:var(--color-blue-200)] bg-[rgba(239,246,255,0.86)] text-[var(--color-primary-700)] shadow-[0_18px_28px_-22px_rgba(37,99,235,0.48)]"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-600)]",
                      )}
                    >
                      <RadioGroupItem
                        value="bank_two"
                        id="position-location-two"
                        className="order-[-1]"
                      />
                      <BankBadge
                        bank="bank_two"
                        locale={locale}
                        className="mt-1 self-start"
                      />
                      <span className="text-xs leading-5 text-[var(--color-slate-500)]">
                        {t.positions.bankTwoHelper}
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {isEditing && editingPosition ? (
                  <div className={dialogSectionClass}>
                    <p className={panelLabelClass}>{t.positions.currentHolding}</p>
                    <div className="mt-3 rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] p-4 shadow-sm">
                      <p className="text-sm font-semibold text-[var(--color-primary-900)]">
                        {formatNumber(editingPosition.quantity, locale)} ·{" "}
                        {formatCurrency(editingPosition.entryPrice, "USD", locale)}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-slate-600)]">
                        {formatDate(editingPosition.entryDate, locale)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-slate-500)]">
                        {t.positions.since} {formatDate(editingPosition.entryDate, locale)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={dialogSectionClass}>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="initialPrice">{t.positions.initialPrice}</Label>
                          <Input
                            id="initialPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                            value={
                              Number.isFinite(formData.initialPrice)
                                ? formData.initialPrice
                                : 0
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                initialPrice:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="initialQuantity">
                            {t.positions.initialQuantity}
                          </Label>
                          <Input
                            id="initialQuantity"
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                            value={
                              Number.isFinite(formData.initialQuantity)
                                ? formData.initialQuantity
                                : 0
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                initialQuantity:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="initialDate">{t.positions.initialDate}</Label>
                          <Input
                            id="initialDate"
                            type="date"
                            className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
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
                    </div>

                    <div className={dialogSectionClass}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Label
                            htmlFor="initial-commission-toggle"
                            className={panelLabelClass}
                          >
                            {t.positions.transactionCommissionToggle}
                          </Label>
                          <p className="mt-1 text-xs leading-5 text-[var(--color-slate-500)]">
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
                      <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[rgba(255,255,255,0.72)] px-3.5 py-3 text-xs leading-5 text-[var(--color-slate-500)]">
                        {locale === "he"
                          ? "כאשר עמלה פעילה, היא תיכנס אוטומטית ללוט הקנייה הראשון."
                          : "When commission is enabled, it is applied directly to the first buy lot."}
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label htmlFor="initial-commission-amount">
                          {t.positions.transactionCommissionAmount}
                        </Label>
                        <Input
                          id="initial-commission-amount"
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
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
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className={dialogFooterClass}>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={dialogActionButtonClass}
                    onClick={() => setDialogOpen(false)}
                  >
                    {t.positions.cancel}
                  </Button>
                  <Button
                    type="submit"
                    className={`${dialogActionButtonClass} bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] text-[var(--color-neutral-white)] hover:bg-[var(--color-primary-650)]`}
                  >
                    {t.positions.save}
                  </Button>
                </div>
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
          <DialogContent className={dialogShellClass}>
            <DialogHeader className="border-b border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] px-5 py-4 sm:px-6">
              <DialogTitle className="text-lg font-bold tracking-tight text-[var(--color-primary-900)] sm:text-xl">
                {isEditingTransaction
                  ? t.positions.editTransaction
                  : t.positions.addTransaction}
              </DialogTitle>
              {transactionTarget && (
                <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                  {(transactionTarget.display || transactionTarget.symbol).trim()} · {transactionTarget.symbol}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                  {isEditingTransaction
                    ? t.positions.editTransaction
                    : t.positions.addTransaction}
                </span>
                <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.9)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                  {transactionForm.type === "SELL" ? t.positions.sell : t.positions.buy}
                </span>
              </div>
            </DialogHeader>
            <form onSubmit={handleTransactionSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <div className={dialogSectionClass}>
                  <Label className={panelLabelClass}>{t.positions.transactionType}</Label>
                  <RadioGroup
                    value={transactionForm.type}
                    onValueChange={(value) =>
                      setTransactionForm({
                        ...transactionForm,
                        type: value as PositionLotType,
                      })
                    }
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <label
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm transition",
                        transactionForm.type === "BUY"
                          ? "border-[color:var(--color-emerald-200)] bg-[rgba(236,253,245,0.88)] text-[var(--color-emerald-700)] shadow-[0_18px_30px_-24px_rgba(16,185,129,0.34)]"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-600)]",
                      )}
                    >
                      <RadioGroupItem value="BUY" id="transaction-buy" />
                      {t.positions.buy}
                    </label>
                    <label
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm transition",
                        transactionForm.type === "SELL"
                          ? "border-[color:var(--color-rose-200)] bg-[rgba(255,241,242,0.9)] text-[var(--color-rose-700)] shadow-[0_18px_30px_-24px_rgba(244,63,94,0.3)]"
                          : "border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-600)]",
                      )}
                    >
                      <RadioGroupItem value="SELL" id="transaction-sell" />
                      {t.positions.sell}
                    </label>
                  </RadioGroup>
                </div>

                <div className={dialogSectionClass}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="transactionPrice">
                        {t.positions.transactionPrice}
                      </Label>
                      <Input
                        id="transactionPrice"
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
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
                    <div className="space-y-2">
                      <Label htmlFor="transactionQuantity">
                        {t.positions.transactionQuantity}
                      </Label>
                      <Input
                        id="transactionQuantity"
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                        value={transactionForm.quantity}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            quantity: Number.parseFloat(e.target.value) || 0,
                          })
                        }
                        required
                      />
                      {transactionForm.type === "SELL" && transactionTarget && (
                        <p className="text-xs leading-5 text-[var(--color-slate-500)]">
                          {t.positions.availableQuantity}:{" "}
                          {formatNumber(transactionTarget.quantity, locale)}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transactionDate">
                        {t.positions.transactionDate}
                      </Label>
                      <Input
                        id="transactionDate"
                        type="date"
                        className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
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
                </div>

                <div className={dialogSectionClass}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label
                        htmlFor="transaction-commission-toggle"
                        className={panelLabelClass}
                      >
                        {t.positions.transactionCommissionToggle}
                      </Label>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-slate-500)]">
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
                  <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[rgba(255,255,255,0.72)] px-3.5 py-3 text-xs leading-5 text-[var(--color-slate-500)]">
                    {transactionForm.type === "SELL"
                      ? locale === "he"
                        ? "בעסקאות מכירה העמלה תופחת ישירות מתוצאת העסקה."
                        : "For sell transactions, commission is deducted directly from the trade outcome."
                      : locale === "he"
                        ? "בעסקאות קנייה העמלה מצטרפת לעלות הלוט החדש."
                        : "For buy transactions, commission is added to the cost basis of the new lot."}
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="transaction-commission-amount">
                      {t.positions.transactionCommissionAmount}
                    </Label>
                    <Input
                      id="transaction-commission-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
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
                  </div>
                </div>
              </div>
              <div className={dialogFooterClass}>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={dialogActionButtonClass}
                    onClick={() => setTransactionDialogOpen(false)}
                  >
                    {t.positions.cancel}
                  </Button>
                  <Button
                    type="submit"
                    className={`${dialogActionButtonClass} bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] text-[var(--color-neutral-white)] hover:bg-[var(--color-primary-650)]`}
                  >
                    {t.positions.saveTransaction}
                  </Button>
                </div>
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
          <DialogContent className={historyDialogShellClass}>
            <DialogHeader className="border-b border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] px-5 py-4 sm:px-6">
              <DialogTitle className="text-lg font-bold tracking-tight text-[var(--color-primary-900)] sm:text-xl">
                {t.positions.manageHistory}
              </DialogTitle>
              {historyTarget && (
                <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                  {(historyTarget.display || historyTarget.symbol).trim()} ·{" "}
                  {historyTarget.symbol}
                </p>
              )}
              {historyTarget && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                    {positionsPageCopy.historySummary}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.9)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                    {t.positions.transactionCount(historyTarget.lots?.length ?? 0)}
                  </span>
                </div>
              )}
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
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
                          className="grid gap-3 rounded-[24px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.94))] p-4 shadow-[0_18px_28px_-24px_rgba(15,23,42,0.38)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
                        >
                          <span
                            className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeTone}`}
                          >
                            {typeLabel}
                          </span>
                          <div className="min-w-0 space-y-1 text-sm text-[var(--color-slate-600)]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold text-[var(--color-primary-900)]">
                                {formatNumber(lot.quantity, locale)}
                              </span>
                              <span>·</span>
                              <span className="font-semibold text-[var(--color-primary-900)]">
                                {formatCurrency(lot.price, "USD", locale)}
                              </span>
                            </div>
                            <p className="text-xs leading-5 text-[var(--color-slate-500)]">
                              {formatDate(lot.executedAt, locale)}
                            </p>
                            <p className="text-xs leading-5 text-[var(--color-slate-500)]">
                              {commissionLabel}
                            </p>
                          </div>
                          <div className="flex items-center justify-start gap-1 sm:justify-end sm:self-start">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-[var(--color-slate-500)] hover:bg-[color:var(--color-primary-010)] hover:text-[var(--color-primary-700)]"
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
                              className="h-9 w-9 rounded-full text-[var(--color-rose-600)] hover:bg-[color:var(--color-rose-50)] hover:text-[var(--color-rose-700)]"
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
                  <div className="rounded-2xl border border-dashed border-[color:var(--color-slate-300)] bg-[color:var(--color-slate-50)]/60 p-5 text-center">
                    <p className="text-sm font-semibold text-[var(--color-slate-700)]">
                      {t.positions.noTransactions}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--color-slate-500)]">
                      {locale === "he"
                        ? "ניתן להוסיף עסקה חדשה כדי להתחיל לעקוב אחרי ההיסטוריה."
                        : "Add a transaction to start building the history timeline."}
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3" aria-busy="true">
                  <div className="h-4 w-40 rounded-full bg-[color:var(--color-slate-200)]/80 animate-pulse" />
                  <div className="h-3 w-56 rounded-full bg-[color:var(--color-slate-100)] animate-pulse" />
                </div>
              )}
            </div>
            {historyTarget && (
              <div className={dialogFooterClass}>
                <Button
                  className="h-11 w-full rounded-2xl bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] text-[var(--color-neutral-white)] shadow-[0_18px_32px_-22px_rgba(37,99,235,0.7)] hover:bg-[var(--color-primary-650)]"
                  onClick={() => openTransactionDialog(historyTarget)}
                >
                  <Plus className="h-4 w-4" />
                  {t.positions.addTransaction}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <main className="mt-8 space-y-8">
          <section className={`${sectionShellClass} px-4 py-6 sm:px-8`}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_52%)]"
            />
            <div className="relative z-10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {t.positions.overviewTitle}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                    {positionsPageCopy.workspaceTitle}
                  </h2>
                  <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                    {t.positions.overviewDescription}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--color-slate-200)] bg-[rgba(255,255,255,0.94)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-500)]">
                    {locale === "he" ? "תצוגת מצב" : "Snapshot view"}
                  </span>
                  <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                    {positionsPageCopy.resultsLabel}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overviewStats.map(({ key, label, value, icon: Icon, tone }) => (
                  <Card
                    key={key}
                    className={cn(cardShellClass, tone, "border-[color:var(--color-slate-200)]/75")}
                  >
                    <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                      <div className="rounded-[20px] border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.88)] p-2.5 text-[var(--color-primary-700)] shadow-[0_16px_24px_-20px_rgba(37,99,235,0.6)]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-500)] sm:text-[11px]">
                          {label}
                        </p>
                        <p className="text-[clamp(1.05rem,2.2vw,1.3rem)] font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {value}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className={`${sectionShellClass} px-4 py-8 sm:px-8`}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(59,130,246,0.08),transparent_26%),radial-gradient(circle_at_92%_24%,rgba(16,185,129,0.06),transparent_22%)]"
            />
            <div className="relative z-10">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {positionsPageCopy.workspaceTitle}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--color-primary-900)] sm:text-2xl">
                    {t.positions.title}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-[var(--color-slate-500)]">
                    {positionsPageCopy.workspaceSubtitle}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.9)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                    {t.positions.filteredResultCount(
                      filteredPositionItems.length,
                      positions.length,
                    )}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.9)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-500)]">
                    {t.positions.rangeSummary(
                      displayFrom,
                      displayTo,
                      filteredPositionItems.length,
                    )}
                  </span>
                </div>
              </div>
              {loading ? (
                <Card className={cn(cardShellClass, "overflow-hidden")}>
                  <CardContent className="space-y-5 p-5 sm:p-6">
                    <div className="space-y-2">
                      <div className="h-4 w-40 animate-pulse rounded-full bg-[color:var(--color-slate-200)]/80" />
                      <div className="h-3 w-72 animate-pulse rounded-full bg-[color:var(--color-slate-100)]" />
                    </div>
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 animate-pulse rounded-full bg-[color:var(--color-slate-200)]" />
                              <div className="space-y-2">
                                <div className="h-4 w-36 animate-pulse rounded-full bg-[color:var(--color-slate-200)]" />
                                <div className="h-3 w-24 animate-pulse rounded-full bg-[color:var(--color-slate-100)]" />
                              </div>
                            </div>
                            <div className="hidden h-8 w-24 animate-pulse rounded-full bg-[color:var(--color-slate-100)] sm:block" />
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {Array.from({ length: 4 }).map((__, metricIndex) => (
                              <div
                                key={metricIndex}
                                className="h-16 animate-pulse rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-slate-200)] pt-4">
                      <div className="h-3 w-32 animate-pulse rounded-full bg-[color:var(--color-slate-100)]" />
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 animate-pulse rounded-full bg-[color:var(--color-slate-200)]" />
                        <div className="h-9 w-9 animate-pulse rounded-full bg-[color:var(--color-slate-200)]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : positions.length === 0 ? (
                <Card className="border border-dashed border-[color:var(--color-slate-300)] bg-[color:var(--color-neutral-white)] shadow-none">
                  <CardContent className="flex flex-col items-center gap-4 px-5 py-14 text-center sm:px-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] text-[var(--color-primary-600)]">
                      <Layers className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-[var(--color-slate-700)]">
                        {t.dashboard.noPositions}
                      </p>
                      <p className="max-w-md text-sm leading-6 text-[var(--color-slate-500)]">
                        {t.positions.emptyStateDescription}
                      </p>
                    </div>
                    <Button
                      onClick={openAddDialog}
                      className="gap-2 bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] text-[var(--color-neutral-white)] shadow-[0_18px_32px_-22px_rgba(37,99,235,0.7)] hover:bg-[var(--color-primary-650)]"
                    >
                      <Plus className="h-4 w-4" />
                      {t.positions.add}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)] xl:items-start">
                  <Card className={`${toolbarCardClass} xl:sticky xl:top-6`}>
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className={panelLabelClass}>
                            {locale === "he" ? "סינון והתאמה" : "Filter and sort"}
                          </p>
                          <p className="text-sm leading-6 text-[var(--color-slate-500)]">
                            {positionsPageCopy.workspaceSubtitle}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary-700)] shadow-sm">
                          {formatNumber(filteredPositionItems.length, locale)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <Label className={controlLabelClass} htmlFor="position-search">
                          {locale === "he" ? "חיפוש" : "Search"}
                        </Label>
                        <div className="relative">
                          <Search className={cn("pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-slate-400)]", searchIconClassName)} />
                          <Input
                            id="position-search"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t.positions.searchPlaceholder}
                            className={cn(
                              "h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm",
                              isRtl ? "pr-9" : "pl-9",
                            )}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="space-y-2">
                          <Label className={controlLabelClass}>
                            {t.positions.filterByBank}
                          </Label>
                          <Select
                            value={locationFilter}
                            onValueChange={(value) =>
                              setLocationFilter(value as PositionLocationFilter)
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm">
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

                        <div className="space-y-2">
                          <Label className={controlLabelClass}>
                            {t.positions.sortBy}
                          </Label>
                          <Select
                            value={sortOption}
                            onValueChange={(value) =>
                              setSortOption(value as PositionSortOption)
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm">
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

                        <div className="space-y-2">
                          <Label className={controlLabelClass}>
                            {t.positions.pageSizeLabel}
                          </Label>
                          <Select
                            value={String(pageSize)}
                            onValueChange={(value) =>
                              setPageSize(Number.parseInt(value, 10))
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm">
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

                      <div className="space-y-3 rounded-[24px] border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.72)] px-3.5 py-3 text-xs text-[var(--color-slate-500)] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {positionsPageCopy.filtersLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(248,250,252,0.92)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                            {activeFilterCount}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[color:var(--color-primary-050)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                            {t.positions.filteredResultCount(
                              filteredPositionItems.length,
                              positions.length,
                            )}
                          </span>
                          <span className="rounded-full bg-[color:var(--color-slate-100)] px-3 py-1 font-semibold text-[var(--color-slate-600)]">
                            {t.positions.rangeSummary(
                              displayFrom,
                              displayTo,
                              filteredPositionItems.length,
                            )}
                          </span>
                        </div>
                        {hasActiveFilters ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full border border-[color:var(--color-slate-200)] px-3 text-xs text-[var(--color-slate-600)] hover:bg-[color:var(--color-slate-50)] hover:text-[var(--color-primary-700)]"
                            onClick={() => {
                              setSearchTerm("");
                              setLocationFilter("all");
                            }}
                          >
                            {t.positions.clearFilters}
                          </Button>
                        ) : (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-400)]">
                            {positionsPageCopy.noFiltersLabel}
                          </span>
                        )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-5">
                    {filteredPositionItems.length === 0 ? (
                      <Card className="border border-dashed border-[color:var(--color-slate-300)] bg-[color:var(--color-neutral-white)] shadow-none">
                        <CardContent className="flex flex-col items-center gap-4 px-5 py-14 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-slate-50)] text-[var(--color-slate-500)]">
                            <Search className="h-5 w-5" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-[var(--color-slate-700)]">
                              {t.positions.noFilteredResults}
                            </p>
                            <p className="max-w-sm text-sm leading-6 text-[var(--color-slate-500)]">
                              {locale === "he"
                                ? "נסה לשנות את החיפוש, הבנק או המיון כדי למצוא פוזיציה."
                                : "Try adjusting search, bank, or sort to find a position."}
                            </p>
                          </div>
                          {hasActiveFilters && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setSearchTerm("");
                                setLocationFilter("all");
                              }}
                            >
                              {t.positions.clearFilters}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <div className="hidden overflow-hidden rounded-[30px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_24px_44px_-34px_rgba(15,23,42,0.44)] md:block">
                          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-slate-200)]/70 bg-[rgba(248,250,252,0.88)] px-5 py-4">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {positionsPageCopy.resultsLabel}
                              </p>
                              <p className="mt-1 text-sm text-[var(--color-slate-500)]">
                                {t.positions.rangeSummary(
                                  displayFrom,
                                  displayTo,
                                  filteredPositionItems.length,
                                )}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-600)]">
                              {formatNumber(paginatedPositionItems.length, locale)}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <Table className="min-w-[980px]">
                              <TableHeader className="bg-[color:var(--color-slate-50)]">
                                <TableRow className="border-b border-[color:var(--color-slate-200)]/60 hover:bg-transparent">
                                  <TableHead className="py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.columnAsset}
                                  </TableHead>
                                  <TableHead className="py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.quantity}
                                  </TableHead>
                                  <TableHead className="py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.entryPrice}
                                  </TableHead>
                                  <TableHead className="py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.entryDate}
                                  </TableHead>
                                  <TableHead className="py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.lastActivity}
                                  </TableHead>
                                  <TableHead className="py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.positions.transactionsTitle}
                                  </TableHead>
                                  <TableHead className="py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
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
                                      className="group border-b border-[color:var(--color-slate-200)]/50 transition-colors hover:bg-[rgba(248,250,252,0.92)]"
                                    >
                                      <TableCell className="py-4">
                                        <div className="flex items-center gap-3">
                                          <Avatar className="h-11 w-11 border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]">
                                            <StockAvatarImage
                                              symbol={position.symbol}
                                              display={`${position.display} logo`}
                                              imageUrl={position.imageUrl}
                                            />
                                            <AvatarFallback className="text-xs font-semibold text-[var(--color-slate-600)]">
                                              {item.fallbackInitials}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold tracking-tight text-[var(--color-primary-900)]">
                                              {position.display}
                                            </p>
                                            <div className="mt-1 flex items-center gap-2">
                                              <Badge className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-slate-600)]">
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
                                      <TableCell className="py-4 text-right font-medium text-[var(--color-slate-700)]">
                                        {formatNumber(position.quantity, locale)}
                                      </TableCell>
                                      <TableCell className="py-4 text-right font-medium text-[var(--color-slate-700)]">
                                        {formatCurrency(position.entryPrice, "USD", locale)}
                                      </TableCell>
                                      <TableCell className="py-4 text-[var(--color-slate-600)]">
                                        {formatDate(position.entryDate, locale)}
                                      </TableCell>
                                      <TableCell className="py-4 text-[var(--color-slate-600)]">
                                        {formatDate(item.lastActivityDate, locale)}
                                      </TableCell>
                                      <TableCell className="py-4">
                                        {sortedLots.length > 0 ? (
                                          <div className="space-y-2">
                                            <p className="text-xs font-semibold text-[var(--color-slate-500)]">
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
                                          <span className="text-xs text-[var(--color-slate-400)]">
                                            {t.positions.noTransactions}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="py-4 align-top">
                                        <div className="flex flex-col gap-2 xl:items-end">
                                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            <Link
                                              href={`/stock/${position.symbol}`}
                                              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] px-3.5 text-xs font-semibold text-[var(--color-neutral-white)] shadow-[0_16px_28px_-22px_rgba(37,99,235,0.7)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-650)] xl:w-auto"
                                            >
                                              <BarChart3 className="h-4 w-4" />
                                              <span>{t.dashboard.viewDetails}</span>
                                            </Link>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => openTransactionDialog(position)}
                                              className={rowActionButtonClass}
                                            >
                                              <ArrowRightLeft className="h-4 w-4" />
                                              <span>{t.positions.addTransaction}</span>
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => openHistoryDialog(position)}
                                              className={rowActionButtonClass}
                                            >
                                              <History className="h-4 w-4" />
                                              <span>{t.positions.manageHistory}</span>
                                            </Button>
                                          </div>
                                          <div className="flex items-center justify-end gap-2 rounded-full border border-[color:var(--color-slate-200)]/75 bg-[rgba(248,250,252,0.9)] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => openEditDialog(position)}
                                              aria-label={t.positions.edit}
                                              className="h-8 w-8 rounded-full text-[var(--color-slate-500)] hover:bg-[color:var(--color-primary-010)] hover:text-[var(--color-primary-700)]"
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
                                              className="h-8 w-8 rounded-full text-[var(--color-rose-600)] hover:bg-[color:var(--color-rose-50)] hover:text-[var(--color-rose-700)] disabled:text-[var(--color-slate-300)]"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <div className="space-y-3 md:hidden">
                          {paginatedPositionItems.map((item) => {
                            const { position, sortedLots, recentLots } = item;

                            return (
                              <Card
                                key={position.id ?? `${position.symbol}-${position.entryDate}`}
                                className={cn(cardShellClass, "border-[color:var(--color-slate-200)]/85")}
                              >
                                <CardHeader className="space-y-4 pb-3 pt-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <Avatar className="h-11 w-11 border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]">
                                        <StockAvatarImage
                                          symbol={position.symbol}
                                          display={`${position.display} logo`}
                                          imageUrl={position.imageUrl}
                                        />
                                        <AvatarFallback className="text-xs font-semibold text-[var(--color-slate-600)]">
                                          {item.fallbackInitials}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold tracking-tight text-[var(--color-primary-900)]">
                                          {position.display}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                          <Badge className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-slate-600)]">
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
                                    <Link
                                      href={`/stock/${position.symbol}`}
                                      className="inline-flex h-9 self-start items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))] px-3 text-xs font-semibold text-[var(--color-neutral-white)] shadow-[0_16px_28px_-22px_rgba(37,99,235,0.7)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-650)] sm:self-auto"
                                    >
                                      <BarChart3 className="h-4 w-4" />
                                      <span>{t.dashboard.viewDetails}</span>
                                    </Link>
                                  </div>
                                  <div className="grid gap-2 text-xs text-[var(--color-slate-600)] sm:grid-cols-2">
                                    <div className="rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-2.5 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-slate-500)]">
                                        {t.positions.quantity}
                                      </p>
                                      <p className="mt-0.5 font-semibold text-[var(--color-primary-900)]">
                                        {formatNumber(position.quantity, locale)}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-2.5 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-slate-500)]">
                                        {t.positions.entryPrice}
                                      </p>
                                      <p className="mt-0.5 font-semibold text-[var(--color-primary-900)]">
                                        {formatCurrency(position.entryPrice, "USD", locale)}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-2.5 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-slate-500)]">
                                        {t.positions.entryDate}
                                      </p>
                                      <p className="mt-0.5 font-semibold text-[var(--color-primary-900)]">
                                        {formatDate(position.entryDate, locale)}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-2.5 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-slate-500)]">
                                        {t.positions.lastActivity}
                                      </p>
                                      <p className="mt-0.5 font-semibold text-[var(--color-primary-900)]">
                                        {formatDate(item.lastActivityDate, locale)}
                                      </p>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-0">
                                  <div>
                                    <p className="text-xs font-semibold text-[var(--color-slate-500)]">
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
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openTransactionDialog(position)}
                                      className={rowActionButtonClass}
                                    >
                                      <ArrowRightLeft className="h-4 w-4" />
                                      {t.positions.addTransaction}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openHistoryDialog(position)}
                                      className={rowActionButtonClass}
                                    >
                                      <History className="h-4 w-4" />
                                      {t.positions.manageHistory}
                                    </Button>
                                  </div>
                                  <div className="flex items-center justify-start gap-1.5 rounded-full border border-[color:var(--color-slate-200)]/75 bg-[rgba(248,250,252,0.9)] px-2 py-1 sm:justify-end">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditDialog(position)}
                                        aria-label={t.positions.edit}
                                        className="h-8 w-8 rounded-full text-[var(--color-slate-500)] hover:bg-[color:var(--color-primary-010)] hover:text-[var(--color-primary-700)]"
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
                                        className="h-8 w-8 rounded-full text-[var(--color-rose-600)] hover:bg-[color:var(--color-rose-50)] hover:text-[var(--color-rose-700)] disabled:text-[var(--color-slate-300)]"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] px-4 py-3 text-xs text-[var(--color-slate-500)] shadow-sm">
                          <span className="font-semibold">
                            {t.positions.pageIndicator(currentPage, totalPages)}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]"
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
                              className="h-9 w-9 rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]"
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
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </DashboardPageShell>
  );
}
