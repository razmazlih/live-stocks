"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const current = theme === "system" ? systemTheme : theme;

  // Tokenized toggle control keeps parity across light/dark palettes.
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="rounded-xl border border-border/60 bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-sm transition hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
    >
      {current === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
