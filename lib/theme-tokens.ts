export function readCssVariable(variable: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

  if (!value) {
    return fallback;
  }

  if (value.startsWith("hsl") || value.startsWith("rgb") || value.startsWith("#")) {
    return value;
  }

  return `hsl(${value})`;
}

export function readChartPalette(): string[] {
  const fallback = [
    "hsl(221.2 83.2% 53.3%)",
    "hsl(142.1 70.6% 45.3%)",
    "hsl(346.8 77.2% 49.8%)",
    "hsl(30 92% 60%)",
    "hsl(266.7 84.6% 57.8%)",
  ];

  if (typeof window === "undefined") {
    return fallback;
  }

  return fallback.map((color, index) =>
    readCssVariable(`--chart-${index + 1}`, color),
  );
}
