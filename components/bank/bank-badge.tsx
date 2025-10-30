"use client";

import type { JSX } from "react";

import { cn } from "@/lib/utils";

export type BankLocation = "bank_one" | "bank_two";

type BankBadgeSize = "sm" | "md";

type BankBadgeProps = {
  location: BankLocation;
  label: string;
  className?: string;
  size?: BankBadgeSize;
  showLabel?: boolean;
};

type BankTheme = {
  badge: string;
  iconContainer: string;
  helper: string;
  helperMuted: string;
  icon: JSX.Element;
};

const OneZeroMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="4" y="5" width="4" height="14" rx="1.5" fill="currentColor" opacity="0.92" />
    <path
      d="M13 4.5c-3.037 0-5.5 2.463-5.5 5.5v4c0 3.037 2.463 5.5 5.5 5.5s5.5-2.463 5.5-5.5v-4c0-3.037-2.463-5.5-5.5-5.5zm0 3c1.379 0 2.5 1.121 2.5 2.5v4c0 1.379-1.121 2.5-2.5 2.5S10.5 15.379 10.5 14v-4c0-1.379 1.121-2.5 2.5-2.5z"
      fill="currentColor"
    />
  </svg>
);

const PepperMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M16.75 4.5c-1.591 0-2.643.874-3.21 2.074-.197.425-.584.676-1.033.676h-.257C8.786 7.25 6 9.88 6 13.063 6 16.344 8.656 19 11.938 19h.437c3.282 0 5.938-2.656 5.938-5.937 0-2.147-1.15-4.082-2.956-5.12-.403-.234-.604-.72-.446-1.168.13-.365.401-.775 1.039-.775h.75V4.5h-.95z"
      fill="currentColor"
    />
    <path
      d="M16.75 4.5V3.25c1.243 0 2.25 1.007 2.25 2.25h-1.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BANK_THEMES: Record<BankLocation, BankTheme> = {
  bank_one: {
    badge:
      "bg-gradient-to-r from-[#4338CA] via-[#5B21B6] to-[#2563EB] text-white ring-[#4C1D95]/40",
    iconContainer: "bg-white/20 text-white",
    helper: "text-[#312E81]",
    helperMuted: "text-[#3730A3]",
    icon: <OneZeroMark className="h-3.5 w-3.5" />,
  },
  bank_two: {
    badge:
      "bg-gradient-to-r from-[#F97316] via-[#FB7185] to-[#EF4444] text-white ring-[#F97316]/40",
    iconContainer: "bg-white/15 text-white",
    helper: "text-[#9A3412]",
    helperMuted: "text-[#C2410C]",
    icon: <PepperMark className="h-3.5 w-3.5" />,
  },
};

export function BankBadge({
  location,
  label,
  className,
  size = "md",
  showLabel = true,
}: BankBadgeProps) {
  const theme = BANK_THEMES[location];

  const sizeClasses =
    size === "sm"
      ? "gap-1.5 px-2 py-0.5 text-xs"
      : "gap-2 px-3 py-1 text-sm tracking-tight";

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold ring-1 ring-inset shadow-sm backdrop-blur-sm",
        sizeClasses,
        theme.badge,
        className,
      )}
    >
      <span className={cn("flex items-center justify-center rounded-full", iconSize, theme.iconContainer)}>
        {theme.icon}
      </span>
      {showLabel ? <span className="leading-none">{label}</span> : null}
    </span>
  );
}

export function bankHelperClass(location: BankLocation, muted?: boolean) {
  const theme = BANK_THEMES[location];
  return muted ? theme.helperMuted : theme.helper;
}
