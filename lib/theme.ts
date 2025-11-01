export function readCssToken(token: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`)
    .trim();

  if (!raw) {
    return fallback;
  }

  if (raw.startsWith("hsl") || raw.startsWith("color-mix")) {
    return raw;
  }

  return `hsl(${raw})`;
}

export function getChartPalette(size = 5): string[] {
  const fallback = [
    "hsl(217.2 91.2% 59.8%)",
    "hsl(173 58% 39%)",
    "hsl(197 37% 24%)",
    "hsl(43 74% 66%)",
    "hsl(27 87% 67%)",
  ];

  if (typeof window === "undefined") {
    return fallback.slice(0, size);
  }

  const palette: string[] = [];
  for (let index = 1; index <= size; index += 1) {
    const token = readCssToken(`chart-${index}`, fallback[(index - 1) % fallback.length]);
    palette.push(token);
  }

  return palette;
}
