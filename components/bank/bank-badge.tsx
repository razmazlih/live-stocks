"use client";

import { type ComponentPropsWithoutRef, type JSX } from "react";

import { cn } from "@/lib/utils";
import { type PositionLocation } from "@/types";

type BankBadgeProps = {
  location: PositionLocation;
  label: string;
  size?: "sm" | "md" | "lg";
} & ComponentPropsWithoutRef<"span">;

const bankStyles: Record<PositionLocation, { badge: string; text: string; iconBg: string; logo: JSX.Element }> = {
  bank_one: {
    badge:
      "bg-gradient-to-r from-[#3A1CFF] via-[#5A4BFF] to-[#26D9FF] text-white shadow-[0_8px_30px_-12px_rgba(44,82,235,0.45)]",
    text: "text-white",
    iconBg: "bg-white/30",
    logo: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
        <defs>
          <linearGradient id="oneZeroGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#CFF6FF" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <path
          d="M7 5c-1.105 0-2 .895-2 2v10c0 1.105.895 2 2 2s2-.895 2-2V7c0-1.105-.895-2-2-2zm10 0c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 3.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"
          fill="url(#oneZeroGradient)"
        />
      </svg>
    ),
  },
  bank_two: {
    badge:
      "bg-gradient-to-r from-[#FF5F96] via-[#FF3D78] to-[#FF1763] text-white shadow-[0_8px_30px_-12px_rgba(255,61,120,0.45)]",
    text: "text-white",
    iconBg: "bg-white/25",
    logo: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
        <defs>
          <linearGradient id="pepperGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FFE3EF" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <path
          d="M18.5 5c-1.657 0-3 1.343-3 3 0 .512.127.996.352 1.418l-6.172 6.172A2.984 2.984 0 0 0 8 15c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3c0-.512-.127-.996-.352-1.418l6.172-6.172A2.984 2.984 0 0 0 18.5 11c1.657 0 3-1.343 3-3s-1.343-3-3-3z"
          fill="url(#pepperGradient)"
        />
      </svg>
    ),
  },
};

const sizeStyles: Record<NonNullable<BankBadgeProps["size"]>, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-3 py-1 text-sm",
  lg: "gap-2 px-4 py-1.5 text-sm sm:text-base",
};

export function BankBadge({ location, label, size = "md", className, ...rest }: BankBadgeProps) {
  const styles = bankStyles[location];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tracking-tight",
        "ring-1 ring-black/5 backdrop-blur-sm",
        styles.badge,
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          styles.iconBg,
        )}
      >
        {styles.logo}
      </span>
      <span className={cn("leading-none", styles.text)}>{label}</span>
    </span>
  );
}
