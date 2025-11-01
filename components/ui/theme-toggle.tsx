"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const current = theme === "system" ? systemTheme : theme;

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="rounded-xl px-3 py-2 border bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
    >
      {current === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
