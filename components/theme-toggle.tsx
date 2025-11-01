"use client";
import { useTheme } from "next-themes";

/**
 * Theme toggle relies on CSS tokens instead of fixed colors so it stays accessible in both themes.
 */
export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const current = theme === "system" ? systemTheme : theme;

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="rounded-xl px-3 py-2 border bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--muted))]"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
    >
      {current === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
