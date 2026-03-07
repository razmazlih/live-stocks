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
  PositionPlan,
  StockQuote,
} from "@/types";
import {
  DEFAULT_COMMISSION_USD,
  mapPositionPlanRow,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StockAvatarImage } from "@/components/ui/stock-avatar-image";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
  CalendarPlus,
  Ban,
  Layers,
  Package,
  CalendarClock,
  GitBranch,
  RefreshCw,
  CircleDollarSign,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DashboardPageShell } from "@/components/dashboard/page-shell";

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
  targetPrice: number;
  targetQuantity: number;
  targetDate: string;
  planHasCommission: boolean;
  planCommissionAmount: number;
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

type NewPositionMode = "immediate" | "plan";

interface PlanFormData {
  id?: string;
  positionId?: string | null;
  symbol: string;
  display: string;
  imageUrl: string;
  side: PositionPlan["side"];
  targetPrice: number;
  targetQuantity: number;
  targetDate: string;
  hasCommission: boolean;
  commissionAmount: number;
  location: PositionLocation | null;
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
    hasCommission: true,
    commissionAmount: DEFAULT_COMMISSION_USD,
  };
}

function createDefaultPlanForm(
  overrides: Partial<PlanFormData> = {},
): PlanFormData {
  return {
    symbol: "",
    display: "",
    imageUrl: "",
    side: "buy",
    targetPrice: 0,
    targetQuantity: 0,
    targetDate: getTodayIsoDate(),
    hasCommission: true,
    commissionAmount: DEFAULT_COMMISSION_USD,
    location: "bank_one",
    ...overrides,
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

export default function PositionsPage() {
  const { locale, triggerRefresh, processPlans, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [positions, setPositions] = useState<Position[]>([]);
  const [unassignedPlans, setUnassignedPlans] = useState<PositionPlan[]>([]);
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
    targetPrice: 0,
    targetQuantity: 0,
    targetDate: getTodayIsoDate(),
    planHasCommission: true,
    planCommissionAmount: DEFAULT_COMMISSION_USD,
  });
  const [newPositionMode, setNewPositionMode] =
    useState<NewPositionMode>("immediate");
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionTarget, setTransactionTarget] = useState<Position | null>(
    null,
  );
  const [transactionForm, setTransactionForm] = useState<TransactionFormData>(
    createDefaultTransactionForm(),
  );
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormData>(
    createDefaultPlanForm(),
  );
  const [planContextPosition, setPlanContextPosition] =
    useState<Position | null>(null);
  const lastFetchedSymbolRef = useRef<string | null>(null);
  const isEditing = Boolean(editingPosition);
  const isEditingTransaction = Boolean(transactionForm.id);
  const isEditingPlan = Boolean(planForm.id);
  const isRtl = locale === "he";
  const planStatusLabels: Record<PositionPlan["status"], string> = {
    pending: t.positions.planStatusPending,
    triggered: t.positions.planStatusTriggered,
    expired: t.positions.planStatusExpired,
    cancelled: t.positions.planStatusCancelled,
  };
  const planStatusClasses: Record<PositionPlan["status"], string> = {
    pending: "bg-sky-100 text-sky-700",
    triggered: "bg-emerald-100 text-emerald-700",
    expired: "bg-slate-200 text-slate-600",
    cancelled: "bg-rose-100 text-rose-700",
  };
  const canSelectSell = Boolean(planContextPosition?.id ?? planForm.positionId);

  const historyTarget = useMemo(() => {
    if (!historyTargetId) {
      return null;
    }
    return (
      positions.find((position) => position.id === historyTargetId) ?? null
    );
  }, [historyTargetId, positions]);

  const planRecords = useMemo(
    () => [
      ...positions.flatMap((position) =>
        (position.plans ?? []).map((plan) => ({ plan, position })),
      ),
      ...unassignedPlans.map((plan) => ({
        plan,
        position: null as Position | null,
      })),
    ],
    [positions, unassignedPlans],
  );

  const activePlans = useMemo(
    () =>
      planRecords.filter(
        ({ plan }) => plan.status !== "expired" && plan.status !== "cancelled",
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
    () =>
      planRecords.filter(
        ({ plan }) => plan.status === "expired" || plan.status === "cancelled",
      ),
    [planRecords],
  );

  const totalQuantity = useMemo(
    () =>
      positions.reduce(
        (sum, position) =>
          sum + (Number.isFinite(position.quantity) ? position.quantity : 0),
        0,
      ),
    [positions],
  );

  const pendingPlansCount = useMemo(
    () => activePlans.filter(({ plan }) => plan.status === "pending").length,
    [activePlans],
  );

  const triggeredPlansCount = useMemo(
    () => activePlans.filter(({ plan }) => plan.status === "triggered").length,
    [activePlans],
  );

  const overviewStats = [
    {
      key: "positions",
      label: t.positions.overviewActivePositions,
      value: formatNumber(positions.length, locale),
      icon: Layers,
    },
    {
      key: "quantity",
      label: t.positions.overviewTotalQuantity,
      value: formatNumber(totalQuantity, locale),
      icon: Package,
    },
    {
      key: "pending-plans",
      label: t.positions.overviewPendingPlans,
      value: formatNumber(pendingPlansCount, locale),
      icon: CalendarClock,
    },
    {
      key: "detached-plans",
      label: t.positions.overviewDetachedPlans,
      value: formatNumber(activeDetachedPlans.length, locale),
      icon: GitBranch,
    },
  ];

  const headerMetaBadges = [
    {
      key: "positions",
      icon: Layers,
      label: `${t.positions.overviewActivePositions}: ${formatNumber(positions.length, locale)}`,
      className: "bg-blue-50 text-blue-600",
      iconClassName: "text-blue-500",
    },
    {
      key: "pending-plans",
      icon: CalendarClock,
      label: `${t.positions.planStatusPending}: ${formatNumber(pendingPlansCount, locale)}`,
      className: "bg-[color:var(--color-neutral-white)]/70 text-slate-600",
      iconClassName: "text-slate-500",
    },
    {
      key: "triggered-plans",
      icon: RefreshCw,
      label: `${t.positions.planStatusTriggered}: ${formatNumber(triggeredPlansCount, locale)}`,
      className: "bg-emerald-50 text-emerald-600",
      iconClassName: "text-emerald-500",
    },
    {
      key: "detached-plans",
      icon: GitBranch,
      label: `${t.positions.overviewDetachedPlans}: ${formatNumber(activeDetachedPlans.length, locale)}`,
      className: "bg-[color:var(--color-neutral-white)]/70 text-slate-600",
      iconClassName: "text-slate-500",
    },
  ];

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      const [positionsResult, unattachedPlansResult] = await Promise.all([
        supabase
          .from("positions")
          .select("*, position_lots(*), position_plans(*)")
          .order("symbol"),
        supabase
          .from("position_plans")
          .select("*")
          .is("position_id", null)
          .order("target_date", { ascending: true }),
      ]);

      if (positionsResult.error) throw positionsResult.error;
      if (unattachedPlansResult.error) throw unattachedPlansResult.error;

      const mappedPositions: Position[] = (positionsResult.data || []).map(
        mapPositionRow,
      );
      const mappedUnassignedPlans: PositionPlan[] = (
        unattachedPlansResult.data || []
      ).map(mapPositionPlanRow);

      setPositions(mappedPositions);
      setUnassignedPlans(mappedUnassignedPlans);
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
    setNewPositionMode("immediate");
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
      targetPrice: 0,
      targetQuantity: 0,
      targetDate: getTodayIsoDate(),
      planHasCommission: true,
      planCommissionAmount: DEFAULT_COMMISSION_USD,
    });
    lastFetchedSymbolRef.current = null;
    setDialogOpen(true);
  }, []);

  function openEditDialog(position: Position) {
    setEditingPosition(position);
    setNewPositionMode("immediate");
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
      targetPrice: 0,
      targetQuantity: 0,
      targetDate: getTodayIsoDate(),
      planHasCommission: true,
      planCommissionAmount: DEFAULT_COMMISSION_USD,
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
        side: "buy",
        location: position.location,
      }),
    );
    setPlanDialogOpen(true);
  }

  const openDetachedPlanDialog = useCallback(() => {
    setPlanContextPosition(null);
    setPlanForm(createDefaultPlanForm());
    setPlanDialogOpen(true);
  }, []);

  function openEditPlanDialog(
    plan: PositionPlan,
    position: Position | null = null,
  ) {
    if (plan.status !== "pending") {
      return;
    }

    setPlanContextPosition(position ?? null);
    setPlanForm({
      id: plan.id,
      positionId: plan.positionId ?? null,
      symbol: plan.symbol,
      display: plan.display ?? "",
      imageUrl: plan.imageUrl ?? "",
      side: plan.side,
      targetPrice: plan.targetPrice,
      targetQuantity: plan.targetQuantity,
      targetDate: plan.targetDate,
      hasCommission: plan.hasCommission,
      commissionAmount: plan.hasCommission ? plan.commissionAmount : 0,
      location: plan.positionId
        ? (position?.location ?? plan.location ?? null)
        : (plan.location ?? "bank_one"),
    });
    setPlanDialogOpen(true);
  }

  const quickActions = useMemo<DashboardQuickAction[]>(() => {
    const baseActions = createCommonQuickActions(t, {
      exclude: ["positions"],
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
          "bg-[var(--color-primary-600)] text-[var(--color-neutral-white)] shadow-sm hover:bg-[var(--color-primary-650)]",
      },
      {
        key: "new-plan",
        icon: CalendarPlus,
        label: t.positions.addPlan,
        onClick: openDetachedPlanDialog,
        variant: "secondary",
        disabled: loading,
      },
      ...baseActions,
    ];
  }, [t, triggerRefresh, loading, openAddDialog, openDetachedPlanDialog]);

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
          targetPrice: price,
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
      toast.error(
        locale === "he" ? "נא למלא את כל השדות" : "Please fill all fields",
      );
      return;
    }

    if (!editingPosition) {
      if (newPositionMode === "immediate") {
        if (formData.initialPrice <= 0 || formData.initialQuantity <= 0) {
          toast.error(
            locale === "he"
              ? "נדרש מחיר וכמות חיוביים לכניסה"
              : "Positive price and quantity are required",
          );
          return;
        }
        if (
          formData.initialHasCommission &&
          formData.initialCommissionAmount < 0
        ) {
          toast.error(t.positions.transactionCommissionValidationError);
          return;
        }
      } else {
        if (formData.targetPrice <= 0 || formData.targetQuantity <= 0) {
          toast.error(t.positions.planValidationError);
          return;
        }
        if (formData.planHasCommission && formData.planCommissionAmount < 0) {
          toast.error(t.positions.transactionCommissionValidationError);
          return;
        }
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
      } else if (newPositionMode === "immediate") {
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
      } else {
        const planCommissionAmount = formData.planHasCommission
          ? Math.max(formData.planCommissionAmount, 0)
          : 0;

        const { error } = await supabase.from("position_plans").insert({
          position_id: null,
          symbol: formData.symbol,
          display: formData.display,
          image_url:
            formData.imageUrl ||
            `https://logo.clearbit.com/${formData.symbol.toLowerCase()}.com`,
          side: "buy",
          target_price: formData.targetPrice,
          target_quantity: formData.targetQuantity,
          target_date: formData.targetDate,
          has_commission: formData.planHasCommission,
          commission_amount: planCommissionAmount,
          location: formData.location,
        });

        if (error) throw error;

        toast.success(t.positions.planSaved);
      }

      setDialogOpen(false);
      setNewPositionMode("immediate");
      loadPositions();
      triggerRefresh();
      void processPlans();
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

  async function handlePlanSubmit(e: React.FormEvent) {
    e.preventDefault();

    const symbol = planForm.symbol.trim().toUpperCase();
    const display =
      planForm.display.trim() || planContextPosition?.display || symbol;
    const imageUrl =
      planForm.imageUrl.trim() ||
      planContextPosition?.imageUrl ||
      `https://logo.clearbit.com/${symbol.toLowerCase()}.com`;
    const side = planForm.side;
    const targetPrice = Number.isFinite(planForm.targetPrice)
      ? planForm.targetPrice
      : 0;
    const targetQuantity = Number.isFinite(planForm.targetQuantity)
      ? planForm.targetQuantity
      : 0;
    const targetDate = planForm.targetDate;

    if (!symbol || targetPrice <= 0 || targetQuantity <= 0 || !targetDate) {
      toast.error(t.positions.planValidationError);
      return;
    }

    if (planForm.hasCommission && planForm.commissionAmount < 0) {
      toast.error(t.positions.transactionCommissionValidationError);
      return;
    }

    const positionId = planContextPosition?.id ?? planForm.positionId ?? null;
    const commissionAmount = planForm.hasCommission
      ? Math.max(planForm.commissionAmount, 0)
      : 0;
    const resolvedLocation =
      planContextPosition?.location ?? planForm.location ?? null;

    if (side === "sell" && !positionId) {
      toast.error(t.positions.planSellDetachedError);
      return;
    }

    if (!positionId && !resolvedLocation) {
      toast.error(t.positions.locationValidationError);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (isEditingPlan && planForm.id) {
        const { error } = await supabase
          .from("position_plans")
          .update({
            symbol,
            display,
            image_url: imageUrl,
            side,
            target_price: targetPrice,
            target_quantity: targetQuantity,
            target_date: targetDate,
            position_id: positionId,
            has_commission: planForm.hasCommission,
            commission_amount: commissionAmount,
            location: resolvedLocation,
          })
          .eq("id", planForm.id);

        if (error) throw error;
        toast.success(t.positions.planUpdated);
      } else {
        const { error } = await supabase.from("position_plans").insert({
          symbol,
          display,
          image_url: imageUrl,
          side,
          target_price: targetPrice,
          target_quantity: targetQuantity,
          target_date: targetDate,
          position_id: positionId,
          has_commission: planForm.hasCommission,
          commission_amount: commissionAmount,
          location: resolvedLocation,
        });

        if (error) throw error;
        toast.success(t.positions.planSaved);
      }

      handlePlanDialogOpenChange(false);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error("Error saving plan:", error);
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
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("position_plans")
        .update({ status: "cancelled", expired_at: today })
        .eq("id", plan.id);

      if (error) throw error;

      toast.success(t.positions.planCancelled);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error("Error cancelling plan:", error);
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
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("position_plans")
        .delete()
        .eq("id", plan.id);

      if (error) throw error;

      toast.success(t.positions.planDeleted);
      await loadPositions();
      triggerRefresh();
      void processPlans();
    } catch (error) {
      console.error("Error deleting plan:", error);
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
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-5 py-5 shadow-xl glass-blur-sm sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[color:var(--color-blue-200)]/60 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-blue-100 p-2.5 text-blue-600 shadow-inner">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[var(--color-primary-900)] sm:text-3xl">
                    {t.positions.title}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
                    {t.positions.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                {headerMetaBadges.map((badge) => {
                  const Icon = badge.icon;
                  return (
                    <span
                      key={badge.key}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 shadow-sm",
                        badge.className,
                      )}
                    >
                      <Icon className={cn("h-4 w-4", badge.iconClassName)} />
                      <span>{badge.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <QuickActionsSection
              title={t.dashboard.quickActions}
              actions={quickActions}
            >
              <p className="mt-4 text-xs text-slate-500">
                {t.positions.quickActionsDescription}
              </p>
            </QuickActionsSection>
          </div>
        </header>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingPosition ? t.positions.edit : t.positions.add}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <Label htmlFor="symbol">{t.positions.symbol}</Label>
                  <Input
                    id="symbol"
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
                <div className="sm:col-span-1">
                  <Label htmlFor="display">{t.positions.display}</Label>
                  <Input
                    id="display"
                    value={formData.display}
                    onChange={(e) =>
                      setFormData({ ...formData, display: e.target.value })
                    }
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
                  onChange={(e) =>
                    setFormData({ ...formData, imageUrl: e.target.value })
                  }
                  placeholder="https://logo.clearbit.com/apple.com"
                />
              </div>
              <div>
                <Label>{t.positions.locationLabel}</Label>
                <RadioGroup
                  value={formData.location}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      location: value as PositionLocation,
                    })
                  }
                  className="mt-2 grid gap-2 sm:grid-cols-2"
                >
                  <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
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
                    <span className="text-xs text-slate-500">
                      {t.positions.bankOneHelper}
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
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
                    <span className="text-xs text-slate-500">
                      {t.positions.bankTwoHelper}
                    </span>
                  </label>
                </RadioGroup>
              </div>
              {isEditing && editingPosition ? (
                <div className="rounded-lg border border-slate-200 bg-[color:var(--color-slate-50)]/70 p-4 text-sm text-slate-600">
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
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>{t.positions.planModeLabel}</Label>
                    <RadioGroup
                      value={newPositionMode}
                      onValueChange={(value) =>
                        setNewPositionMode(value as NewPositionMode)
                      }
                      className="mt-2 grid gap-2 sm:grid-cols-2"
                    >
                      <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
                        <RadioGroupItem
                          value="immediate"
                          id="position-mode-immediate"
                          className="order-[-1]"
                        />
                        <span className="font-semibold text-slate-700">
                          {t.positions.planModeImmediate}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t.positions.planModeImmediateDescription}
                        </span>
                      </label>
                      <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
                        <RadioGroupItem
                          value="plan"
                          id="position-mode-plan"
                          className="order-[-1]"
                        />
                        <span className="font-semibold text-slate-700">
                          {t.positions.planModePlan}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t.positions.planModePlanDescription}
                        </span>
                      </label>
                    </RadioGroup>
                  </div>
                  {newPositionMode === "immediate" ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                          <Label htmlFor="initialPrice">
                            {t.positions.initialPrice}
                          </Label>
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
                                initialPrice:
                                  Number.parseFloat(e.target.value) || 0,
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
                                initialQuantity:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label htmlFor="initialDate">
                            {t.positions.initialDate}
                          </Label>
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
                      <div className="rounded-lg border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70 p-3">
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
                        <div className="mt-3">
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
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                          <Label htmlFor="targetPrice">
                            {t.positions.planTargetPrice}
                          </Label>
                          <Input
                            id="targetPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              Number.isFinite(formData.targetPrice)
                                ? formData.targetPrice
                                : 0
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                targetPrice:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label htmlFor="targetQuantity">
                            {t.positions.planTargetQuantity}
                          </Label>
                          <Input
                            id="targetQuantity"
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              Number.isFinite(formData.targetQuantity)
                                ? formData.targetQuantity
                                : 0
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                targetQuantity:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label htmlFor="targetDate">
                            {t.positions.planTargetDate}
                          </Label>
                          <Input
                            id="targetDate"
                            type="date"
                            value={formData.targetDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                targetDate: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <Label
                              htmlFor="plan-commission-toggle-inline"
                              className="text-sm font-medium"
                            >
                              {t.positions.transactionCommissionToggle}
                            </Label>
                            <p className="text-xs text-slate-500">
                              {t.positions.transactionCommissionHelper}
                            </p>
                          </div>
                          <Switch
                            id="plan-commission-toggle-inline"
                            checked={formData.planHasCommission}
                            onCheckedChange={(checked) =>
                              setFormData((previous) => ({
                                ...previous,
                                planHasCommission: checked,
                                planCommissionAmount: checked
                                  ? previous.planCommissionAmount > 0
                                    ? previous.planCommissionAmount
                                    : DEFAULT_COMMISSION_USD
                                  : 0,
                              }))
                            }
                          />
                        </div>
                        <div className="mt-3">
                          <Label htmlFor="plan-commission-amount-inline">
                            {t.positions.transactionCommissionAmount}
                          </Label>
                          <Input
                            id="plan-commission-amount-inline"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.planCommissionAmount}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                planCommissionAmount:
                                  Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            disabled={!formData.planHasCommission}
                            required={formData.planHasCommission}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit">{t.positions.save}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
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
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {isEditingTransaction
                  ? t.positions.editTransaction
                  : t.positions.addTransaction}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <Label>{t.positions.transactionType}</Label>
                <RadioGroup
                  value={transactionForm.type}
                  onValueChange={(value) =>
                    setTransactionForm({
                      ...transactionForm,
                      type: value as PositionLotType,
                    })
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
                  {transactionForm.type === "SELL" && transactionTarget && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t.positions.availableQuantity}:{" "}
                      {formatNumber(transactionTarget.quantity, locale)}
                    </p>
                  )}
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
              <div className="rounded-lg border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70 p-3">
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
                <div className="mt-3">
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
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t.positions.saveTransaction}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTransactionDialogOpen(false)}
                >
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
              {planContextPosition ? (
                <div className="rounded-md border border-slate-200 bg-[color:var(--color-slate-50)]/70 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">
                    {planContextPosition.display}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <Badge
                      variant="secondary"
                      className="bg-slate-200 text-slate-700"
                    >
                      {planContextPosition.symbol}
                    </Badge>
                    <BankBadge
                      bank={
                        planContextPosition.location === "bank_two"
                          ? "bank_two"
                          : "bank_one"
                      }
                      locale={locale}
                      size="sm"
                    />
                    {t.positions.planLinkedHelper}
                  </p>
                </div>
              ) : (
                <div>
                  <Label>{t.positions.locationLabel}</Label>
                  <RadioGroup
                    value={planForm.location ?? "bank_one"}
                    onValueChange={(value) =>
                      setPlanForm({
                        ...planForm,
                        location: value as PositionLocation,
                      })
                    }
                    className="mt-2 grid gap-2 sm:grid-cols-2"
                  >
                    <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
                      <RadioGroupItem
                        value="bank_one"
                        id="plan-location-one"
                        className="order-[-1]"
                      />
                      <BankBadge
                        bank="bank_one"
                        locale={locale}
                        className="mt-1 self-start"
                      />
                      <span className="text-xs text-slate-500">
                        {t.positions.bankOneHelper}
                      </span>
                    </label>
                    <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
                      <RadioGroupItem
                        value="bank_two"
                        id="plan-location-two"
                        className="order-[-1]"
                      />
                      <BankBadge
                        bank="bank_two"
                        locale={locale}
                        className="mt-1 self-start"
                      />
                      <span className="text-xs text-slate-500">
                        {t.positions.bankTwoHelper}
                      </span>
                    </label>
                  </RadioGroup>
                </div>
              )}
              <div>
                <Label>{t.positions.planSideLabel}</Label>
                <RadioGroup
                  value={planForm.side}
                  onValueChange={(value) =>
                    setPlanForm({
                      ...planForm,
                      side: value as PlanFormData["side"],
                    })
                  }
                  className="mt-2 grid gap-2 sm:grid-cols-2"
                >
                  <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm text-slate-600">
                    <RadioGroupItem
                      value="buy"
                      id="plan-side-buy"
                      className="order-[-1]"
                    />
                    <span className="font-semibold text-slate-700">
                      {t.positions.planSideBuy}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t.positions.planSideBuyShort}
                    </span>
                  </label>
                  <label
                    className={`flex flex-col gap-1 rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3 text-sm ${
                      canSelectSell ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    <RadioGroupItem
                      value="sell"
                      id="plan-side-sell"
                      className="order-[-1]"
                      disabled={!canSelectSell}
                    />
                    <span className="font-semibold text-slate-700">
                      {t.positions.planSideSell}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t.positions.planSideSellShort}
                    </span>
                  </label>
                </RadioGroup>
                {!canSelectSell && (
                  <p className="mt-1 text-xs text-slate-500">
                    {t.positions.planSellDetachedHelper}
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-symbol">{t.positions.symbol}</Label>
                  <Input
                    id="plan-symbol"
                    value={planForm.symbol}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        symbol: e.target.value.toUpperCase(),
                      })
                    }
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
                    onChange={(e) =>
                      setPlanForm({ ...planForm, display: e.target.value })
                    }
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
                  onChange={(e) =>
                    setPlanForm({ ...planForm, imageUrl: e.target.value })
                  }
                  placeholder="https://logo.clearbit.com/apple.com"
                  disabled={Boolean(planContextPosition)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="plan-target-price">
                    {t.positions.planTargetPrice}
                  </Label>
                  <Input
                    id="plan-target-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      Number.isFinite(planForm.targetPrice)
                        ? planForm.targetPrice
                        : 0
                    }
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
                  <Label htmlFor="plan-target-quantity">
                    {t.positions.planTargetQuantity}
                  </Label>
                  <Input
                    id="plan-target-quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      Number.isFinite(planForm.targetQuantity)
                        ? planForm.targetQuantity
                        : 0
                    }
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
                  <Label htmlFor="plan-target-date">
                    {t.positions.planTargetDate}
                  </Label>
                  <Input
                    id="plan-target-date"
                    type="date"
                    value={planForm.targetDate}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, targetDate: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label
                      htmlFor="plan-commission-toggle"
                      className="text-sm font-medium"
                    >
                      {t.positions.transactionCommissionToggle}
                    </Label>
                    <p className="text-xs text-slate-500">
                      {t.positions.transactionCommissionHelper}
                    </p>
                  </div>
                  <Switch
                    id="plan-commission-toggle"
                    checked={planForm.hasCommission}
                    onCheckedChange={(checked) =>
                      setPlanForm((previous) => ({
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
                <div className="mt-3">
                  <Label htmlFor="plan-commission-amount">
                    {t.positions.transactionCommissionAmount}
                  </Label>
                  <Input
                    id="plan-commission-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={planForm.commissionAmount}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        commissionAmount:
                          Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    disabled={!planForm.hasCommission}
                    required={planForm.hasCommission}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t.positions.save}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handlePlanDialogOpenChange(false)}
                >
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
                          className="flex items-center gap-3 rounded-md border border-slate-200 bg-[color:var(--color-slate-50)]/70 p-3"
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}
                          >
                            {typeLabel}
                          </span>
                          <div className="flex flex-col text-sm text-slate-600">
                            <span>
                              {formatNumber(lot.quantity, locale)} ·{" "}
                              {formatCurrency(lot.price, "USD", locale)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatDate(lot.executedAt, locale)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {commissionLabel}
                            </span>
                          </div>
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
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
            {historyTarget && (
              <Button
                className="mt-4 w-full"
                onClick={() => openTransactionDialog(historyTarget)}
              >
                <Plus className="h-4 w-4" />
                {t.positions.addTransaction}
              </Button>
            )}
          </DialogContent>
        </Dialog>

        <main className="mt-10 space-y-10">
          <section className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-4 py-6 shadow-xl glass-blur-sm sm:px-8">
            <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-[color:var(--color-blue-100)]/50 blur-3xl" />
            <div className="relative z-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.positions.overviewTitle}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t.positions.overviewDescription}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overviewStats.map(({ key, label, value, icon: Icon }) => (
                  <Card
                    key={key}
                    className="border-none bg-[color:var(--color-neutral-white)]/90 shadow-inner"
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {label}
                        </p>
                        <p className="text-lg font-semibold text-slate-900">
                          {value}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-4 py-8 shadow-xl glass-blur-sm sm:px-8">
            <div className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full bg-[color:var(--color-blue-100)]/40 blur-3xl" />
            <div className="relative z-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]">
                <div className="space-y-4">
                  {loading ? (
                    <Card className="border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white shadow-sm backdrop-blur">
                      <CardContent className="py-16 text-center text-slate-500">
                        {t.common.loading}
                      </CardContent>
                    </Card>
                  ) : positions.length === 0 ? (
                    <Card className="border border-dashed border-slate-300 bg-[color:var(--color-neutral-white)]/60 text-center shadow-none backdrop-blur">
                      <CardContent className="flex flex-col items-center gap-4 py-12">
                        <p className="text-base font-semibold text-slate-700">
                          {t.dashboard.noPositions}
                        </p>
                        <p className="max-w-sm text-sm text-slate-500">
                          {t.positions.emptyStateDescription}
                        </p>
                        <Button onClick={openAddDialog} className="gap-2">
                          <Plus className="h-4 w-4" />
                          {t.positions.add}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {positions.map((position) => {
                        const sortedLots = [...(position.lots ?? [])].sort(
                          (a, b) => {
                            const aTime = new Date(a.executedAt).getTime();
                            const bTime = new Date(b.executedAt).getTime();
                            return Number.isNaN(bTime) || Number.isNaN(aTime)
                              ? 0
                              : bTime - aTime;
                          },
                        );
                        const recentLots = sortedLots.slice(0, 3);
                        const positionActivePlans = (
                          position.plans ?? []
                        ).filter(
                          (plan) =>
                            plan.status !== "expired" &&
                            plan.status !== "cancelled",
                        );

                        const fallbackInitials =
                          (position.display || position.symbol || "?")
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((part) => part[0]?.toUpperCase() ?? "")
                            .join("")
                            .slice(0, 2) || "?";

                        return (
                          <Card
                            key={position.id ?? position.symbol}
                            className="group rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/90 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                          >
                            <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-12 w-12 border border-slate-200 bg-slate-50">
                                  <StockAvatarImage
                                    symbol={position.symbol}
                                    display={`${position.display} logo`}
                                    imageUrl={position.imageUrl}
                                  />
                                  <AvatarFallback className="text-sm font-medium text-slate-600">
                                    {fallbackInitials}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 space-y-1">
                                  <CardTitle className="truncate text-base font-semibold text-slate-900">
                                    {position.display}
                                  </CardTitle>
                                  <CardDescription className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <Badge className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
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
                                    <span className="flex items-center gap-1">
                                      <Package className="h-3.5 w-3.5 text-slate-400" />
                                      {formatNumber(position.quantity, locale)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <CircleDollarSign className="h-3.5 w-3.5 text-slate-400" />
                                      {formatCurrency(
                                        position.entryPrice,
                                        "USD",
                                        locale,
                                      )}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                                      {formatDate(position.entryDate, locale)}
                                    </span>
                                  </CardDescription>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <Link
                                  href={`/stock/${position.symbol}`}
                                  className="shrink-0"
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t.dashboard.viewDetails}
                                    className="rounded-full text-slate-500 hover:text-slate-800"
                                  >
                                    <BarChart3 className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openHistoryDialog(position)}
                                  aria-label={t.positions.manageHistory}
                                  className="rounded-full text-slate-500 hover:text-slate-800"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(position)}
                                  aria-label={t.positions.edit}
                                  className="rounded-full text-slate-500 hover:text-slate-800"
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
                                  className="rounded-full text-rose-500 hover:text-rose-600 disabled:text-slate-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-0 text-sm text-slate-600">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {t.positions.transactionsTitle}
                                    </p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1 rounded-full px-3 text-xs text-slate-500 hover:text-slate-700"
                                      onClick={() =>
                                        openTransactionDialog(position)
                                      }
                                    >
                                      <ArrowRightLeft className="h-4 w-4" />
                                      {t.positions.addTransaction}
                                    </Button>
                                  </div>
                                  {recentLots.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {recentLots.map((lot) => {
                                        const typeLabel =
                                          lot.type === "BUY"
                                            ? t.positions.buy
                                            : t.positions.sell;
                                        const typeBadgeClass =
                                          lot.type === "BUY"
                                            ? "bg-[color:var(--color-emerald-500)]/10 text-emerald-600"
                                            : "bg-[color:var(--color-rose-500)]/10 text-rose-600";
                                        const commissionApplied =
                                          lot.hasCommission &&
                                          lot.commissionAmount > 0;
                                        const commissionLabel =
                                          commissionApplied
                                            ? t.positions.transactionCommissionShort(
                                                formatCurrency(
                                                  lot.commissionAmount,
                                                  "USD",
                                                  locale,
                                                ),
                                              )
                                            : t.positions
                                                .transactionCommissionWaived;
                                        return (
                                          <div
                                            key={`${lot.id}-${lot.executedAt}`}
                                            className="flex flex-wrap items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/70 bg-overlay-neutral-white px-3 py-1 text-xs text-slate-600 shadow-sm"
                                          >
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${typeBadgeClass}`}
                                            >
                                              {typeLabel}
                                            </span>
                                            <span className="font-medium text-slate-700">
                                              {formatNumber(
                                                lot.quantity,
                                                locale,
                                              )}
                                            </span>
                                            <span className="text-slate-400">
                                              ·
                                            </span>
                                            <span>
                                              {formatCurrency(
                                                lot.price,
                                                "USD",
                                                locale,
                                              )}
                                            </span>
                                            <span className="text-slate-400">
                                              ·
                                            </span>
                                            <span>
                                              {formatDate(
                                                lot.executedAt,
                                                locale,
                                              )}
                                            </span>
                                            <span className="text-slate-400">
                                              ·
                                            </span>
                                            <span className="text-slate-500">
                                              {commissionLabel}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-xs text-slate-400">
                                      {t.positions.noTransactions}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {t.positions.activePlansTitle}
                                    </p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1 rounded-full px-3 text-xs text-slate-500 hover:text-slate-700 disabled:text-slate-300"
                                      onClick={() =>
                                        openPlanDialogForPosition(position)
                                      }
                                      disabled={!position.id}
                                    >
                                      <CalendarPlus className="h-4 w-4" />
                                      {t.positions.addPlan}
                                    </Button>
                                  </div>
                                  {positionActivePlans.length > 0 ? (
                                    <div className="mt-2 flex flex-col gap-2">
                                      {positionActivePlans.map((plan) => {
                                        const statusClass =
                                          planStatusClasses[plan.status];
                                        const statusLabel =
                                          planStatusLabels[plan.status];
                                        const sideBadgeClass =
                                          plan.side === "sell"
                                            ? "bg-[color:var(--color-rose-500)]/10 text-rose-600"
                                            : "bg-[color:var(--color-emerald-500)]/10 text-emerald-600";
                                        const sideLabel =
                                          plan.side === "sell"
                                            ? t.positions.planSideSellShort
                                            : t.positions.planSideBuyShort;
                                        return (
                                          <div
                                            key={
                                              plan.id ??
                                              `${plan.symbol}-${plan.targetDate}`
                                            }
                                            className="flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-overlay-neutral-white px-3 py-2 text-xs text-slate-600 shadow-sm"
                                          >
                                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                              <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sideBadgeClass}`}
                                              >
                                                {sideLabel}
                                              </span>
                                              <span
                                                className={`${statusClass} rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase`}
                                              >
                                                {statusLabel}
                                              </span>
                                              <span className="font-semibold text-slate-700">
                                                {plan.symbol}
                                              </span>
                                              <span className="text-slate-500">
                                                {formatNumber(
                                                  plan.targetQuantity,
                                                  locale,
                                                )}{" "}
                                                ·{" "}
                                                {formatCurrency(
                                                  plan.targetPrice,
                                                  "USD",
                                                  locale,
                                                )}
                                              </span>
                                              <span className="text-slate-400">
                                                •{" "}
                                                {formatDate(
                                                  plan.targetDate,
                                                  locale,
                                                )}
                                              </span>
                                              {plan.status === "triggered" &&
                                                plan.triggeredAt && (
                                                  <span className="text-[11px] text-emerald-600">
                                                    {t.positions.planTriggeredDetail(
                                                      formatDate(
                                                        plan.triggeredAt,
                                                        locale,
                                                      ),
                                                      formatCurrency(
                                                        plan.executedPrice ??
                                                          plan.targetPrice,
                                                        "USD",
                                                        locale,
                                                      ),
                                                    )}
                                                  </span>
                                                )}
                                            </div>
                                            {plan.status === "pending" && (
                                              <div className="flex items-center gap-1">
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 rounded-full text-slate-500 hover:text-slate-800"
                                                  onClick={() =>
                                                    openEditPlanDialog(
                                                      plan,
                                                      position,
                                                    )
                                                  }
                                                  aria-label={t.positions.edit}
                                                >
                                                  <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 rounded-full text-rose-500 hover:text-rose-600"
                                                  onClick={() =>
                                                    handlePlanCancel(plan)
                                                  }
                                                  aria-label={
                                                    t.positions.planCancel
                                                  }
                                                >
                                                  <Ban className="h-3.5 w-3.5" />
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-xs text-slate-400">
                                      {t.positions.noActivePlans}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <Card className="border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/90 shadow-sm backdrop-blur">
                    <CardHeader>
                      <CardTitle>{t.positions.activePlansTitle}</CardTitle>
                      <CardDescription>
                        {t.positions.activePlansDescription}
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>
                          {t.positions.planStatusPending}:{" "}
                          {formatNumber(pendingPlansCount, locale)}
                        </span>
                        <span>
                          {t.positions.planStatusTriggered}:{" "}
                          {formatNumber(triggeredPlansCount, locale)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {activePlans.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          {t.positions.noActivePlans}
                        </p>
                      ) : (
                        <ScrollArea className="max-h-[360px] pr-2">
                          <div className="space-y-4">
                            {activeLinkedPlans.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {t.positions.activePlansLinked}
                                </p>
                                <div className="mt-2 space-y-3">
                                  {activeLinkedPlans.map(
                                    ({ plan, position }) => {
                                      if (!position) {
                                        return null;
                                      }
                                      const statusClass =
                                        planStatusClasses[plan.status];
                                      const statusLabel =
                                        planStatusLabels[plan.status];
                                      const sideClass =
                                        plan.side === "sell"
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-emerald-100 text-emerald-700";
                                      const sideLabel =
                                        plan.side === "sell"
                                          ? t.positions.planSideSellShort
                                          : t.positions.planSideBuyShort;
                                      return (
                                        <div
                                          key={
                                            plan.id ??
                                            `${position.id}-${plan.symbol}-${plan.targetDate}`
                                          }
                                          className="rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3"
                                        >
                                          <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-semibold text-slate-800">
                                                {position.display}
                                              </span>
                                              <Badge
                                                variant="secondary"
                                                className="bg-slate-100 text-slate-700"
                                              >
                                                {position.symbol}
                                              </Badge>
                                              <BankBadge
                                                bank={
                                                  position.location ===
                                                  "bank_two"
                                                    ? "bank_two"
                                                    : "bank_one"
                                                }
                                                locale={locale}
                                                size="sm"
                                              />
                                              <Badge
                                                className={`${sideClass} text-[11px]`}
                                              >
                                                {sideLabel}
                                              </Badge>
                                              <Badge
                                                className={`${statusClass} text-[11px]`}
                                              >
                                                {statusLabel}
                                              </Badge>
                                            </div>
                                            <p className="text-sm text-slate-600">
                                              {formatNumber(
                                                plan.targetQuantity,
                                                locale,
                                              )}{" "}
                                              ·{" "}
                                              {formatCurrency(
                                                plan.targetPrice,
                                                "USD",
                                                locale,
                                              )}{" "}
                                              •{" "}
                                              {formatDate(
                                                plan.targetDate,
                                                locale,
                                              )}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              {t.positions.planLinkedTo(
                                                position.display,
                                              )}
                                            </p>
                                            {plan.status === "triggered" &&
                                              plan.triggeredAt && (
                                                <p className="text-xs text-emerald-600">
                                                  {t.positions.planTriggeredDetail(
                                                    formatDate(
                                                      plan.triggeredAt,
                                                      locale,
                                                    ),
                                                    formatCurrency(
                                                      plan.executedPrice ??
                                                        plan.targetPrice,
                                                      "USD",
                                                      locale,
                                                    ),
                                                  )}
                                                </p>
                                              )}
                                            {plan.status === "pending" && (
                                              <div className="flex flex-wrap gap-2">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 gap-1 px-2"
                                                  onClick={() =>
                                                    openEditPlanDialog(
                                                      plan,
                                                      position,
                                                    )
                                                  }
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                  {t.positions.edit}
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 gap-1 px-2"
                                                  onClick={() =>
                                                    handlePlanCancel(plan)
                                                  }
                                                >
                                                  <Ban className="h-4 w-4" />
                                                  {t.positions.planCancel}
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
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
                                    const displayName =
                                      plan.display ?? plan.symbol;
                                    const statusClass =
                                      planStatusClasses[plan.status];
                                    const statusLabel =
                                      planStatusLabels[plan.status];
                                    const sideClass =
                                      plan.side === "sell"
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-emerald-100 text-emerald-700";
                                    const sideLabel =
                                      plan.side === "sell"
                                        ? t.positions.planSideSellShort
                                        : t.positions.planSideBuyShort;
                                    return (
                                      <div
                                        key={
                                          plan.id ??
                                          `detached-${plan.symbol}-${plan.targetDate}`
                                        }
                                        className="rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3"
                                      >
                                        <div className="flex flex-col gap-2">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-800">
                                              {displayName}
                                            </span>
                                            <Badge
                                              variant="secondary"
                                              className="bg-slate-100 text-slate-700"
                                            >
                                              {plan.symbol}
                                            </Badge>
                                            {plan.location ? (
                                              <BankBadge
                                                bank={
                                                  plan.location === "bank_two"
                                                    ? "bank_two"
                                                    : "bank_one"
                                                }
                                                locale={locale}
                                                size="sm"
                                              />
                                            ) : null}
                                            <Badge
                                              className={`${sideClass} text-[11px]`}
                                            >
                                              {sideLabel}
                                            </Badge>
                                            <Badge
                                              className={`${statusClass} text-[11px]`}
                                            >
                                              {statusLabel}
                                            </Badge>
                                          </div>
                                          <p className="text-sm text-slate-600">
                                            {formatNumber(
                                              plan.targetQuantity,
                                              locale,
                                            )}{" "}
                                            ·{" "}
                                            {formatCurrency(
                                              plan.targetPrice,
                                              "USD",
                                              locale,
                                            )}{" "}
                                            •{" "}
                                            {formatDate(
                                              plan.targetDate,
                                              locale,
                                            )}
                                          </p>
                                          <p className="text-xs text-slate-500">
                                            {t.positions.planForNewPosition}
                                          </p>
                                          {plan.status === "pending" && (
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1 px-2"
                                                onClick={() =>
                                                  openEditPlanDialog(plan)
                                                }
                                              >
                                                <Pencil className="h-4 w-4" />
                                                {t.positions.edit}
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1 px-2"
                                                onClick={() =>
                                                  handlePlanCancel(plan)
                                                }
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

                  <Card className="border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/90 shadow-sm backdrop-blur">
                    <CardHeader>
                      <CardTitle>{t.positions.closedPlansTitle}</CardTitle>
                      <CardDescription>
                        {t.positions.closedPlansDescription}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {closedPlans.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          {t.positions.noClosedPlans}
                        </p>
                      ) : (
                        <ScrollArea className="max-h-[360px] pr-2">
                          <div className="space-y-3">
                            {closedPlans.map(({ plan, position }) => {
                              const displayName =
                                position?.display ??
                                plan.display ??
                                plan.symbol;
                              const symbol = position?.symbol ?? plan.symbol;
                              const locationLabel =
                                position?.location ?? plan.location ?? null;
                              const statusClass =
                                planStatusClasses[plan.status];
                              const statusLabel = planStatusLabels[plan.status];
                              const sideClass =
                                plan.side === "sell"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-100 text-emerald-700";
                              const sideLabel =
                                plan.side === "sell"
                                  ? t.positions.planSideSellShort
                                  : t.positions.planSideBuyShort;
                              return (
                                <div
                                  key={
                                    plan.id ??
                                    `closed-${symbol}-${plan.targetDate}`
                                  }
                                  className="rounded-lg border border-slate-200 bg-[color:var(--color-neutral-white)]/70 p-3"
                                >
                                  <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-800">
                                        {displayName}
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className="bg-slate-100 text-slate-700"
                                      >
                                        {symbol}
                                      </Badge>
                                      {locationLabel ? (
                                        <BankBadge
                                          bank={
                                            locationLabel === "bank_two"
                                              ? "bank_two"
                                              : "bank_one"
                                          }
                                          locale={locale}
                                          size="sm"
                                        />
                                      ) : null}
                                      <Badge
                                        className={`${sideClass} text-[11px]`}
                                      >
                                        {sideLabel}
                                      </Badge>
                                      <Badge
                                        className={`${statusClass} text-[11px]`}
                                      >
                                        {statusLabel}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-slate-600">
                                      {formatNumber(
                                        plan.targetQuantity,
                                        locale,
                                      )}{" "}
                                      ·{" "}
                                      {formatCurrency(
                                        plan.targetPrice,
                                        "USD",
                                        locale,
                                      )}{" "}
                                      • {formatDate(plan.targetDate, locale)}
                                    </p>
                                    {plan.status === "expired" &&
                                      plan.expiredAt && (
                                        <p className="text-xs text-slate-500">
                                          {t.positions.planExpiredDetail(
                                            formatDate(plan.expiredAt, locale),
                                          )}
                                        </p>
                                      )}
                                    {plan.status === "cancelled" &&
                                      plan.expiredAt && (
                                        <p className="text-xs text-slate-500">
                                          {t.positions.planCancelledDetail(
                                            formatDate(plan.expiredAt, locale),
                                          )}
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
          </section>
        </main>
      </div>
    </DashboardPageShell>
  );
}
