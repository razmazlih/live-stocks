"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const current = theme === "system" ? systemTheme : theme;

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-sm transition-colors hover:bg-muted/60"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
    >
      {current === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
