// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const DEFAULT_WIDGET_FAMILY = 'medium';
const REFRESH_INTERVAL_MINUTES = 15;
const ILS_SYMBOL = '₪';
const PORTFOLIO_BASE_URL = 'https://razmaz-live-stocks.vercel.app';
const PORTFOLIO_REQUEST_BODY = {
  includeWeightedPrice: true,
  targetCurrency: 'ILS',
};
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const MAX_SPARKLINE_POINTS = 90;
const ANNUAL_GROWTH_RATE = 0.05;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const LRM = '\u200E';
const historySeriesCache = new Map();

const WIDGET_REFERENCE_SIZE = {
  small: { width: 158, height: 158 },
  medium: { width: 338, height: 158 },
  large: { width: 338, height: 354 },
  extraLarge: { width: 720, height: 758 },
};

const IPHONE_WIDGET_SLOT_PRESETS_PT = [
  {
    screens: [{ width: 320, height: 568 }],
    slots: {
      small: { width: 141, height: 141 },
      medium: { width: 292, height: 141 },
      large: { width: 292, height: 311 },
    },
  },
  {
    screens: [{ width: 375, height: 667 }],
    slots: {
      small: { width: 148, height: 148 },
      medium: { width: 321, height: 148 },
      large: { width: 321, height: 324 },
    },
  },
  {
    screens: [{ width: 414, height: 736 }],
    slots: {
      small: { width: 157, height: 157 },
      medium: { width: 348, height: 157 },
      large: { width: 348, height: 357 },
    },
  },
  {
    screens: [{ width: 375, height: 812 }],
    slots: {
      small: { width: 155, height: 155 },
      medium: { width: 329, height: 155 },
      large: { width: 329, height: 345 },
    },
  },
  {
    screens: [
      { width: 390, height: 844 },
      { width: 393, height: 852 },
    ],
    slots: {
      small: { width: 158, height: 158 },
      medium: { width: 338, height: 158 },
      large: { width: 338, height: 354 },
    },
  },
  {
    screens: [{ width: 414, height: 896 }],
    slots: {
      small: { width: 169, height: 169 },
      medium: { width: 360, height: 169 },
      large: { width: 360, height: 379 },
    },
  },
  {
    screens: [
      { width: 428, height: 926 },
      { width: 430, height: 932 },
    ],
    slots: {
      small: { width: 170, height: 170 },
      medium: { width: 364, height: 170 },
      large: { width: 364, height: 382 },
    },
  },
  {
    screens: [{ width: 440, height: 956 }],
    slots: {
      small: { width: 174, height: 174 },
      medium: { width: 373, height: 174 },
      large: { width: 373, height: 390 },
    },
  },
];

const IPAD_WIDGET_SLOT_PRESETS_PT = [
  {
    screens: [{ width: 744, height: 1133 }],
    slots: {
      small: { width: 150, height: 150 },
      medium: { width: 322, height: 150 },
      large: { width: 322, height: 346 },
      extraLarge: { width: 678, height: 346 },
    },
  },
  {
    screens: [{ width: 768, height: 1024 }],
    slots: {
      small: { width: 155, height: 155 },
      medium: { width: 329, height: 155 },
      large: { width: 329, height: 345 },
      extraLarge: { width: 682, height: 345 },
    },
  },
  {
    screens: [{ width: 810, height: 1080 }],
    slots: {
      small: { width: 162, height: 162 },
      medium: { width: 348, height: 162 },
      large: { width: 348, height: 360 },
      extraLarge: { width: 720, height: 360 },
    },
  },
  {
    screens: [{ width: 820, height: 1180 }],
    slots: {
      small: { width: 164, height: 164 },
      medium: { width: 352, height: 164 },
      large: { width: 352, height: 364 },
      extraLarge: { width: 728, height: 364 },
    },
  },
  {
    screens: [{ width: 834, height: 1194 }],
    slots: {
      small: { width: 170, height: 170 },
      medium: { width: 364, height: 170 },
      large: { width: 364, height: 382 },
      extraLarge: { width: 758, height: 382 },
    },
  },
  {
    screens: [{ width: 1024, height: 1366 }],
    slots: {
      small: { width: 214, height: 214 },
      medium: { width: 465, height: 214 },
      large: { width: 465, height: 485 },
      extraLarge: { width: 970, height: 485 },
    },
  },
];

const FAMILY_LAYOUTS = {
  small: {
    widgetPadding: 8,
    cardPadding: { top: 9, left: 9, bottom: 9, right: 9 },
    cornerRadius: 22,
    contentSpacing: 6,
    headerSpacing: 4,
    rowSpacing: 5,
    rowPadding: { top: 6, left: 7, bottom: 6, right: 7 },
    summaryPadding: { top: 7, left: 7, bottom: 7, right: 7 },
    maxRows: 1,
    summaryMode: 'hero',
    showTimestamp: false,
    showEntryDetails: false,
    showTargetColumn: false,
    showSparkline: false,
    showSecondarySummary: false,
    font: {
      headerTitle: 11,
      headerMeta: 9,
      summaryLabel: 10,
      summaryValue: 22,
      summaryMeta: 10,
      rowName: 13,
      rowMeta: 10,
      rowValue: 13,
      badge: 9,
      stateTitle: 12,
      stateBody: 10,
    },
  },
  medium: {
    widgetPadding: 7,
    cardPadding: { top: 8, left: 9, bottom: 8, right: 9 },
    cornerRadius: 22,
    contentSpacing: 5,
    headerSpacing: 4,
    rowSpacing: 5,
    rowPadding: { top: 5, left: 6, bottom: 5, right: 6 },
    summaryPadding: { top: 5, left: 6, bottom: 5, right: 6 },
    maxRows: 1,
    summaryMode: 'strip',
    showTimestamp: true,
    showEntryDetails: false,
    showTargetColumn: true,
    showSparkline: false,
    showSecondarySummary: false,
    metricColumnWidth: 52,
    metricsWidth: 110,
    infoWidth: 132,
    font: {
      headerTitle: 12,
      headerMeta: 9,
      summaryLabel: 9,
      summaryValue: 12,
      summaryMeta: 9,
      rowName: 12,
      rowMeta: 9,
      rowValue: 11,
      badge: 9,
      stateTitle: 12,
      stateBody: 10,
    },
  },
  large: {
    widgetPadding: 9,
    cardPadding: { top: 10, left: 10, bottom: 10, right: 10 },
    cornerRadius: 24,
    contentSpacing: 7,
    headerSpacing: 6,
    rowSpacing: 6,
    rowPadding: { top: 7, left: 7, bottom: 7, right: 7 },
    summaryPadding: { top: 7, left: 7, bottom: 7, right: 7 },
    maxRows: 4,
    summaryMode: 'cards',
    showTimestamp: true,
    showEntryDetails: true,
    showTargetColumn: true,
    showSparkline: true,
    showSecondarySummary: true,
    sparklineWidth: 62,
    sparklineHeight: 22,
    metricColumnWidth: 54,
    metricsWidth: 114,
    infoWidth: 104,
    font: {
      headerTitle: 14,
      headerMeta: 10,
      summaryLabel: 10,
      summaryValue: 15,
      summaryMeta: 10,
      rowName: 14,
      rowMeta: 10,
      rowValue: 13,
      badge: 9,
      stateTitle: 13,
      stateBody: 11,
    },
  },
  extraLarge: {
    widgetPadding: 12,
    cardPadding: { top: 14, left: 14, bottom: 14, right: 14 },
    cornerRadius: 30,
    contentSpacing: 10,
    headerSpacing: 7,
    rowSpacing: 8,
    rowPadding: { top: 9, left: 10, bottom: 9, right: 10 },
    summaryPadding: { top: 10, left: 10, bottom: 10, right: 10 },
    maxRows: 6,
    summaryMode: 'cards',
    showTimestamp: true,
    showEntryDetails: true,
    showTargetColumn: true,
    showSparkline: true,
    showSecondarySummary: true,
    sparklineWidth: 150,
    sparklineHeight: 28,
    metricColumnWidth: 76,
    metricsWidth: 160,
    infoWidth: 180,
    font: {
      headerTitle: 16,
      headerMeta: 11,
      summaryLabel: 11,
      summaryValue: 17,
      summaryMeta: 11,
      rowName: 15,
      rowMeta: 11,
      rowValue: 15,
      badge: 10,
      stateTitle: 14,
      stateBody: 12,
    },
  },
};

function getWidgetFamily() {
  const family = typeof config === 'object' && typeof config.widgetFamily === 'string'
    ? config.widgetFamily
    : DEFAULT_WIDGET_FAMILY;

  return family in FAMILY_LAYOUTS ? family : DEFAULT_WIDGET_FAMILY;
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneBox(box) {
  return {
    top: box.top,
    left: box.left,
    bottom: box.bottom,
    right: box.right,
  };
}

function scaleBox(box, scale) {
  return {
    top: Math.max(0, Math.round(box.top * scale)),
    left: Math.max(0, Math.round(box.left * scale)),
    bottom: Math.max(0, Math.round(box.bottom * scale)),
    right: Math.max(0, Math.round(box.right * scale)),
  };
}

function getDeviceProfile() {
  const size = typeof Device !== 'undefined' && typeof Device.screenSize === 'function'
    ? Device.screenSize()
    : null;
  const width = Number(size?.width);
  const height = Number(size?.height);
  const isPhone = typeof Device !== 'undefined' && typeof Device.isPhone === 'function'
    ? Device.isPhone()
    : true;
  const isPad = typeof Device !== 'undefined' && typeof Device.isPad === 'function'
    ? Device.isPad()
    : !isPhone && Number.isFinite(width) && Number.isFinite(height) && Math.min(width, height) >= 700;
  const isDarkAppearance = typeof Device !== 'undefined' && typeof Device.isUsingDarkAppearance === 'function'
    ? Device.isUsingDarkAppearance()
    : true;

  return {
    width,
    height,
    shortest: Number.isFinite(width) && Number.isFinite(height) ? Math.min(width, height) : null,
    longest: Number.isFinite(width) && Number.isFinite(height) ? Math.max(width, height) : null,
    isPhone,
    isPad,
    isDarkAppearance,
  };
}

function normalizeScreenSize(width, height) {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) {
    return null;
  }

  return {
    width: numericWidth,
    height: numericHeight,
    shortest: Math.min(numericWidth, numericHeight),
    longest: Math.max(numericWidth, numericHeight),
  };
}

function getNearestWidgetSlots(deviceProfile, presets, closeThreshold) {
  const screenSize = normalizeScreenSize(deviceProfile?.width, deviceProfile?.height);
  if (!screenSize) {
    return null;
  }

  let bestMatch = null;
  presets.forEach((preset) => {
    preset.screens.forEach((candidate) => {
      const candidateSize = normalizeScreenSize(candidate.width, candidate.height);
      if (!candidateSize) {
        return;
      }

      const shortestDelta = screenSize.shortest - candidateSize.shortest;
      const longestDelta = screenSize.longest - candidateSize.longest;
      const distance = Math.sqrt((shortestDelta * shortestDelta) + (longestDelta * longestDelta));
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          slots: preset.slots,
          reference: candidateSize,
          distance,
          close: distance <= closeThreshold,
        };
      }
    });
  });

  return bestMatch;
}

function getNearestPhoneWidgetSlots(deviceProfile) {
  return getNearestWidgetSlots(deviceProfile, IPHONE_WIDGET_SLOT_PRESETS_PT, 24);
}

function getNearestPadWidgetSlots(deviceProfile) {
  return getNearestWidgetSlots(deviceProfile, IPAD_WIDGET_SLOT_PRESETS_PT, 96);
}

function estimateWidgetSize(widgetFamily, deviceProfile) {
  const reference = WIDGET_REFERENCE_SIZE[widgetFamily] ?? WIDGET_REFERENCE_SIZE.medium;

  if (deviceProfile?.isPhone) {
    const slotMatch = getNearestPhoneWidgetSlots(deviceProfile);
    const matchedSlot = slotMatch?.slots?.[widgetFamily];
    if (matchedSlot && slotMatch?.close) {
      return { ...matchedSlot, source: 'phone-slot' };
    }

    if (matchedSlot && slotMatch?.reference && Number.isFinite(deviceProfile.shortest)) {
      const widthScale = clampValue(deviceProfile.shortest / slotMatch.reference.shortest, 0.94, 1.08);
      const heightScale = clampValue(deviceProfile.longest / slotMatch.reference.longest, 0.94, 1.08);
      const verticalScale = widgetFamily === 'large'
        ? Math.sqrt(widthScale * heightScale)
        : widthScale;
      return {
        width: Math.round(matchedSlot.width * widthScale),
        height: Math.round(matchedSlot.height * verticalScale),
        source: 'phone-slot-scaled',
      };
    }
  }

  if (deviceProfile?.isPad) {
    const slotMatch = getNearestPadWidgetSlots(deviceProfile);
    const matchedSlot = slotMatch?.slots?.[widgetFamily];
    if (matchedSlot && slotMatch?.close) {
      return { ...matchedSlot, source: 'pad-slot' };
    }

    if (matchedSlot && slotMatch?.reference && Number.isFinite(deviceProfile.shortest)) {
      const widthScale = clampValue(deviceProfile.shortest / slotMatch.reference.shortest, 0.96, 1.06);
      const heightScale = clampValue(deviceProfile.longest / slotMatch.reference.longest, 0.96, 1.06);
      const verticalScale = widgetFamily === 'large' || widgetFamily === 'extraLarge'
        ? Math.sqrt(widthScale * heightScale)
        : widthScale;
      return {
        width: Math.round(matchedSlot.width * widthScale),
        height: Math.round(matchedSlot.height * verticalScale),
        source: 'pad-slot-scaled',
      };
    }
  }

  if (Number.isFinite(deviceProfile?.shortest) && Number.isFinite(deviceProfile?.longest)) {
    const shortest = deviceProfile.shortest;
    const longest = deviceProfile.longest;
    const fallback = {
      small: { width: Math.round(shortest * 0.40), height: Math.round(shortest * 0.40) },
      medium: { width: Math.round(shortest * 0.85), height: Math.round(shortest * 0.40) },
      large: { width: Math.round(shortest * 0.85), height: Math.round(longest * 0.41) },
      extraLarge: { width: Math.round(shortest * 0.92), height: Math.round(longest * 0.62) },
    }[widgetFamily];
    if (fallback) {
      return { ...fallback, source: 'ratio' };
    }
  }

  return { ...reference, source: 'reference' };
}

function resolveLayout(widgetFamily, deviceProfile) {
  const base = FAMILY_LAYOUTS[widgetFamily] ?? FAMILY_LAYOUTS.medium;
  const metrics = estimateWidgetSize(widgetFamily, deviceProfile);
  const reference = WIDGET_REFERENCE_SIZE[widgetFamily] ?? WIDGET_REFERENCE_SIZE.medium;
  const widthScale = clampValue(metrics.width / reference.width, 0.88, 1.12);
  const heightScale = clampValue(metrics.height / reference.height, 0.88, 1.12);
  const scale = clampValue(Math.sqrt(widthScale * heightScale), 0.92, 1.09);
  const compactSlot = widthScale < 0.97 || heightScale < 0.97;

  const font = {};
  Object.entries(base.font).forEach(([key, value]) => {
    const minimums = {
      headerTitle: 10,
      headerMeta: 8,
      summaryLabel: 8,
      summaryValue: widgetFamily === 'small' ? 18 : 11,
      summaryMeta: 8,
      rowName: 11,
      rowMeta: 8,
      rowValue: 11,
      badge: 8,
      stateTitle: 10,
      stateBody: 9,
    };
    font[key] = Math.max(minimums[key] ?? 8, Math.round(value * scale));
  });

  const layout = {
    ...base,
    widgetFamily,
    widgetSize: metrics,
    compactSlot,
    scale,
    cardPadding: scaleBox(base.cardPadding, scale),
    rowPadding: scaleBox(base.rowPadding, scale),
    summaryPadding: scaleBox(base.summaryPadding, scale),
    widgetPadding: Math.max(6, Math.round(base.widgetPadding * scale)),
    cornerRadius: Math.max(18, Math.round(base.cornerRadius * scale)),
    contentSpacing: Math.max(4, Math.round(base.contentSpacing * scale)),
    headerSpacing: Math.max(3, Math.round(base.headerSpacing * scale)),
    rowSpacing: Math.max(4, Math.round(base.rowSpacing * scale)),
    font,
  };

  if (widgetFamily === 'medium' && compactSlot) {
    layout.showSecondarySummary = false;
    layout.infoWidth = 108;
    layout.metricColumnWidth = 54;
    layout.metricsWidth = 114;
  }

  if (widgetFamily === 'large' && compactSlot) {
    layout.maxRows = 3;
    layout.showSparkline = false;
    layout.infoWidth = 118;
    layout.metricsWidth = 132;
  }

  if (widgetFamily === 'extraLarge' && metrics.height < 520) {
    layout.maxRows = metrics.height < 420 ? 3 : 4;
    layout.showSecondarySummary = metrics.height >= 420;
    layout.sparklineWidth = Math.min(layout.sparklineWidth ?? 150, 116);
    layout.sparklineHeight = Math.min(layout.sparklineHeight ?? 28, 24);
  }

  if (widgetFamily === 'small' && compactSlot) {
    layout.showSecondarySummary = false;
    layout.summaryPadding = cloneBox({ top: 7, left: 7, bottom: 7, right: 7 });
  }

  const innerWidth = Math.max(
    100,
    Math.round(metrics.width - (layout.widgetPadding * 2) - layout.cardPadding.left - layout.cardPadding.right)
  );
  layout.innerWidth = innerWidth;
  layout.summaryCardWidth = Math.max(
    widgetFamily === 'small' ? 96 : 116,
    Math.floor((innerWidth - Math.max(6, layout.contentSpacing)) / 2)
  );
  layout.rowGap = Math.max(5, Math.floor(layout.contentSpacing * 0.75));
  layout.rowInnerWidth = Math.max(
    80,
    innerWidth - layout.rowPadding.left - layout.rowPadding.right
  );

  if (widgetFamily !== 'small') {
    const gapTotal = layout.showSparkline ? layout.rowGap * 2 : layout.rowGap;
    const availableForColumns = Math.max(80, layout.rowInnerWidth - gapTotal);
    const minimumInfoWidth = widgetFamily === 'extraLarge'
      ? metrics.height < 520 ? 132 : 160
      : widgetFamily === 'large'
        ? 100
        : 112;
    const minimumMetricsWidth = layout.showTargetColumn ? 102 : 56;
    let nextMetricsWidth = Math.min(
      layout.metricsWidth ?? 126,
      Math.max(minimumMetricsWidth, Math.floor(availableForColumns * (layout.showSparkline ? 0.36 : 0.38)))
    );
    let nextSparklineWidth = layout.showSparkline
      ? Math.min(layout.sparklineWidth ?? 70, Math.max(46, Math.floor(availableForColumns * 0.18)))
      : 0;
    let nextInfoWidth = availableForColumns - nextMetricsWidth - nextSparklineWidth;

    if (layout.showSparkline && nextInfoWidth < minimumInfoWidth) {
      const deficit = minimumInfoWidth - nextInfoWidth;
      nextSparklineWidth = Math.max(0, nextSparklineWidth - deficit);
      nextInfoWidth = availableForColumns - nextMetricsWidth - nextSparklineWidth;
    }

    if (layout.showSparkline && nextSparklineWidth < 46) {
      layout.showSparkline = false;
      nextSparklineWidth = 0;
      nextInfoWidth = Math.max(80, layout.rowInnerWidth - layout.rowGap) - nextMetricsWidth;
    }

    if (nextInfoWidth < minimumInfoWidth) {
      nextMetricsWidth = Math.max(
        minimumMetricsWidth,
        nextMetricsWidth - (minimumInfoWidth - nextInfoWidth)
      );
      nextInfoWidth = availableForColumns - nextMetricsWidth;
    }

    layout.metricsWidth = Math.max(minimumMetricsWidth, nextMetricsWidth);
    layout.metricColumnWidth = layout.showTargetColumn
      ? Math.max(48, Math.floor((layout.metricsWidth - 6) / 2))
      : Math.max(52, layout.metricsWidth);
    layout.sparklineWidth = Math.max(0, nextSparklineWidth);
    layout.infoWidth = Math.max(82, nextInfoWidth);
  }

  return layout;
}

function detectRtlLocale() {
  const locale = typeof Device !== 'undefined' && typeof Device.locale === 'function'
    ? Device.locale()
    : 'he-IL';
  const normalized = typeof locale === 'string'
    ? locale.trim().toLowerCase().replace('_', '-')
    : '';

  if (!normalized) {
    return true;
  }

  return normalized.startsWith('he') ||
    normalized.startsWith('ar') ||
    normalized.startsWith('fa') ||
    normalized.startsWith('ur');
}

function getWidgetParameterTokens() {
  const parameter = typeof args === 'object' && typeof args.widgetParameter === 'string'
    ? args.widgetParameter.trim().toLowerCase()
    : '';

  if (!parameter) {
    return [];
  }

  return parameter
    .split(/[,\s;&|]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeWidgetParameterToken(token) {
  if (typeof token !== 'string') {
    return '';
  }
  const normalized = token.trim().toLowerCase();
  if (!normalized.includes('=') && !normalized.includes('://')) {
    return normalized.replace(':', '=');
  }
  return normalized;
}

function getWidgetParameterValue(keys) {
  const allowedKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const rawToken of getWidgetParameterTokens()) {
    const token = normalizeWidgetParameterToken(rawToken);
    const separatorIndex = token.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = token.slice(0, separatorIndex).trim();
    const value = rawToken.slice(separatorIndex + 1).trim();
    if (allowedKeys.has(key) && value) {
      return value;
    }
  }

  return null;
}

function sanitizeBaseUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return null;
  }
}

function resolvePortfolioBaseUrl() {
  return sanitizeBaseUrl(getWidgetParameterValue(['baseurl', 'base-url', 'host', 'url'])) ??
    sanitizeBaseUrl(PORTFOLIO_BASE_URL) ??
    PORTFOLIO_BASE_URL;
}

function resolveThemeAppearance() {
  const tokens = getWidgetParameterTokens().map(normalizeWidgetParameterToken);

  if (tokens.length === 0) {
    return 'system';
  }

  const lightTokens = new Set(['light', 'theme=light', 'appearance=light', 'mode=light', 'בהיר']);
  const darkTokens = new Set(['dark', 'theme=dark', 'appearance=dark', 'mode=dark', 'כהה']);
  const systemTokens = new Set(['system', 'auto', 'default', 'theme=system', 'appearance=system', 'mode=system', 'אוטומטי', 'מערכת']);

  if (tokens.some((token) => lightTokens.has(token))) {
    return 'light';
  }
  if (tokens.some((token) => darkTokens.has(token))) {
    return 'dark';
  }
  if (tokens.some((token) => systemTokens.has(token))) {
    return 'system';
  }

  return 'system';
}

function makeColor(hex, alpha = 1) {
  return new Color(hex, alpha);
}

function createTheme(appearance, isDarkAppearance) {
  const specs = {
    light: {
      gradient: ['#F8FAFC', '#EFF6FF', '#FFFFFF'],
      surface: ['#FFFFFF', 0.94],
      surfaceMuted: ['#F8FAFC', 0.9],
      stroke: ['#DBEAFE', 0.8],
      subtleStroke: ['#CBD5E1', 0.62],
      text: '#0F172A',
      textMuted: '#475569',
      textSoft: '#64748B',
      accent: '#2563EB',
      accentSoft: ['#DBEAFE', 0.92],
      positive: '#059669',
      negative: '#DC2626',
      neutral: '#D97706',
      shadow: ['#0F172A', 0.11],
      sparklineDot: '#FFFFFF',
    },
    dark: {
      gradient: ['#020617', '#0F172A', '#111827'],
      surface: ['#0F172A', 0.88],
      surfaceMuted: ['#1E293B', 0.82],
      stroke: ['#334155', 0.54],
      subtleStroke: ['#475569', 0.38],
      text: '#F8FAFC',
      textMuted: '#CBD5E1',
      textSoft: '#94A3B8',
      accent: '#60A5FA',
      accentSoft: ['#1E3A8A', 0.78],
      positive: '#34D399',
      negative: '#FB7185',
      neutral: '#FBBF24',
      shadow: ['#000000', 0.38],
      sparklineDot: '#0F172A',
    },
  };

  const useDark = appearance === 'dark'
    ? true
    : appearance === 'light'
      ? false
      : Boolean(isDarkAppearance);
  const active = useDark ? specs.dark : specs.light;
  const useDynamic = appearance === 'system' && typeof Color.dynamic === 'function';

  const dynamicSolid = (lightHex, darkHex) => useDynamic
    ? Color.dynamic(makeColor(lightHex), makeColor(darkHex))
    : makeColor(useDark ? darkHex : lightHex);
  const dynamicTone = (lightEntry, darkEntry) => useDynamic
    ? Color.dynamic(makeColor(lightEntry[0], lightEntry[1]), makeColor(darkEntry[0], darkEntry[1]))
    : makeColor(active === specs.dark ? darkEntry[0] : lightEntry[0], active === specs.dark ? darkEntry[1] : lightEntry[1]);

  return {
    gradientColors: active.gradient.map((hex, index) => dynamicSolid(specs.light.gradient[index], specs.dark.gradient[index])),
    gradientLocations: [0, 0.48, 1],
    surface: dynamicTone(specs.light.surface, specs.dark.surface),
    surfaceMuted: dynamicTone(specs.light.surfaceMuted, specs.dark.surfaceMuted),
    stroke: dynamicTone(specs.light.stroke, specs.dark.stroke),
    subtleStroke: dynamicTone(specs.light.subtleStroke, specs.dark.subtleStroke),
    text: dynamicSolid(specs.light.text, specs.dark.text),
    textMuted: dynamicSolid(specs.light.textMuted, specs.dark.textMuted),
    textSoft: dynamicSolid(specs.light.textSoft, specs.dark.textSoft),
    accent: dynamicSolid(specs.light.accent, specs.dark.accent),
    accentSoft: dynamicTone(specs.light.accentSoft, specs.dark.accentSoft),
    positive: dynamicSolid(specs.light.positive, specs.dark.positive),
    negative: dynamicSolid(specs.light.negative, specs.dark.negative),
    neutral: dynamicSolid(specs.light.neutral, specs.dark.neutral),
    shadow: dynamicTone(specs.light.shadow, specs.dark.shadow),
    positiveHex: active.positive,
    negativeHex: active.negative,
    neutralHex: active.neutral,
    sparklineDotHex: active.sparklineDot,
    isDark: useDark,
  };
}

function parseDateValue(dateValue) {
  if (!dateValue) {
    return null;
  }
  if (dateValue instanceof Date && Number.isFinite(dateValue.getTime())) {
    return dateValue;
  }
  const parsed = new Date(dateValue);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDateOnly(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(date) {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function getTimestampLabel(dateValue = null, compact = false) {
  const effectiveDate = parseDateValue(dateValue) ?? new Date();
  if (compact) {
    return `עודכן ${formatTime(effectiveDate)}`;
  }

  const dateLabel = formatDateOnly(effectiveDate);
  return dateLabel
    ? `עודכן ${dateLabel} · ${formatTime(effectiveDate)}`
    : `עודכן ${formatTime(effectiveDate)}`;
}

function logError(message) {
  if (typeof console === 'object' && console !== null) {
    if (typeof console.error === 'function') {
      console.error(message);
      return;
    }
    if (typeof console.log === 'function') {
      console.log(message);
    }
  }
}

function compactNumber(value, maximumFractionDigits = 1) {
  const absolute = Math.abs(value);
  const units = [
    { threshold: 1000000000, suffix: 'B' },
    { threshold: 1000000, suffix: 'M' },
    { threshold: 1000, suffix: 'K' },
  ];
  const unit = units.find((candidate) => absolute >= candidate.threshold);
  if (!unit) {
    return absolute.toLocaleString('en-US', {
      minimumFractionDigits: absolute >= 100 ? 0 : 2,
      maximumFractionDigits: absolute >= 100 ? 0 : 2,
    });
  }

  const scaled = absolute / unit.threshold;
  return `${scaled.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}${unit.suffix}`;
}

function isolateLtrText(value) {
  return `${LRM}${String(value ?? '')}${LRM}`;
}

function formatMoneyRaw(value, symbol = '$', compact = false) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const absolute = Math.abs(value);
  if (compact || absolute >= 100000) {
    return `${symbol}${compactNumber(value)}`;
  }

  return `${symbol}${absolute.toLocaleString('en-US', {
    minimumFractionDigits: absolute >= 1000 ? 0 : 2,
    maximumFractionDigits: absolute >= 1000 ? 0 : 2,
  })}`;
}

function formatMoney(value, symbol = '$', compact = false) {
  return isolateLtrText(formatMoneyRaw(value, symbol, compact));
}

function formatSignedMoney(value, symbol = '$', compact = false) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return isolateLtrText(`${sign}${formatMoneyRaw(Math.abs(value), symbol, compact)}`);
}

function currencySymbolForCode(currencyCode) {
  const code = typeof currencyCode === 'string' ? currencyCode.toUpperCase() : '';
  switch (code) {
    case 'USD':
      return '$';
    case 'ILS':
      return ILS_SYMBOL;
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return code ? `${code} ` : '$';
  }
}

function formatQuantity(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return value.toLocaleString('he-IL', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return isolateLtrText(`${sign}${value.toFixed(2)}%`);
}

function normalizeUsdToIlsRate(rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return null;
  }
  return numericRate < 1 ? 1 / numericRate : numericRate;
}

function calculateYearsHeld(entryDate, referenceDate = new Date()) {
  if (!(entryDate instanceof Date) || !Number.isFinite(entryDate.getTime())) {
    return null;
  }
  return Math.max(0, referenceDate.getTime() - entryDate.getTime()) / MS_PER_YEAR;
}

function normalizeTickerForYahoo(symbol) {
  if (typeof symbol !== 'string') {
    return null;
  }
  const cleaned = symbol.trim().toUpperCase();
  return cleaned ? cleaned.replace(/\./g, '-').replace(/\s+/g, '') : null;
}

function downsampleSeries(values, maxPoints = MAX_SPARKLINE_POINTS) {
  if (!Array.isArray(values) || values.length <= maxPoints) {
    return values;
  }
  const step = Math.ceil(values.length / maxPoints);
  const reduced = values.filter((_, index) => index % step === 0);
  const last = values[values.length - 1];
  if (reduced[reduced.length - 1] !== last) {
    reduced.push(last);
  }
  return reduced;
}

function coerceNumericSeries(candidate) {
  if (!Array.isArray(candidate) || candidate.length < 2) {
    return null;
  }

  const numeric = [];
  candidate.forEach((item) => {
    const direct = Number(item);
    if (Number.isFinite(direct) && direct > 0) {
      numeric.push(direct);
      return;
    }

    if (item && typeof item === 'object') {
      const nested = Number(item.close ?? item.price ?? item.value ?? item.c);
      if (Number.isFinite(nested) && nested > 0) {
        numeric.push(nested);
      }
    }
  });

  return numeric.length >= 2 ? numeric : null;
}

async function fetchHistoricalSeriesFromEntry(symbol, entryDate) {
  const yahooTicker = normalizeTickerForYahoo(symbol);
  if (!yahooTicker) {
    return null;
  }

  const parsedEntry = parseDateValue(entryDate);
  const endSec = Math.floor(Date.now() / 1000);
  let startSec = parsedEntry
    ? Math.floor(parsedEntry.getTime() / 1000)
    : endSec - 90 * 24 * 60 * 60;

  if (!Number.isFinite(startSec) || startSec <= 0 || startSec >= endSec) {
    startSec = endSec - 90 * 24 * 60 * 60;
  }

  const cacheKey = `${yahooTicker}:${startSec}:${endSec}`;
  const cached = historySeriesCache.get(cacheKey);
  if (Array.isArray(cached)) {
    return cached;
  }

  try {
    const chartUrl = `${YAHOO_CHART_BASE_URL}${encodeURIComponent(yahooTicker)}?period1=${startSec}&period2=${endSec}&interval=1d&events=div%2Csplits&includePrePost=false`;
    const request = new Request(chartUrl);
    request.headers = { 'User-Agent': DEFAULT_USER_AGENT };
    const payload = await request.loadJSON();
    const result = Array.isArray(payload?.chart?.result) ? payload.chart.result[0] : null;
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const quote = Array.isArray(result?.indicators?.quote) ? result.indicators.quote[0] : null;
    const closes = Array.isArray(quote?.close) ? quote.close : [];
    const values = [];
    const length = Math.min(timestamps.length, closes.length);

    for (let index = 0; index < length; index += 1) {
      const timestamp = Number(timestamps[index]);
      const close = Number(closes[index]);
      if (Number.isFinite(timestamp) && timestamp >= startSec && Number.isFinite(close) && close > 0) {
        values.push(close);
      }
    }

    const normalized = downsampleSeries(values);
    if (!Array.isArray(normalized) || normalized.length < 2) {
      return null;
    }

    historySeriesCache.set(cacheKey, normalized);
    return normalized;
  } catch (error) {
    logError(`Historical chart load failed for ${symbol || 'unknown'}: ${error.message}`);
    return null;
  }
}

function extractSparklineValues(stock, entryPrice, currentPrice, historySeries = null) {
  const seededHistory = coerceNumericSeries(historySeries);
  if (seededHistory) {
    return downsampleSeries(seededHistory);
  }

  const candidates = [
    stock?.sparkline,
    stock?.sparklineValues,
    stock?.price_history,
    stock?.priceHistory,
    stock?.history,
    stock?.prices,
    stock?.chart?.prices,
    stock?.chart?.values,
  ];

  for (const candidate of candidates) {
    const numeric = coerceNumericSeries(candidate);
    if (numeric) {
      return downsampleSeries(numeric);
    }
  }

  if (Number.isFinite(entryPrice) && Number.isFinite(currentPrice)) {
    return [entryPrice, (entryPrice + currentPrice) / 2, currentPrice];
  }

  return null;
}

async function fetchPortfolioSnapshot() {
  const request = new Request(portfolioApiUrl);
  request.method = 'POST';
  request.headers = {
    'Content-Type': 'application/json',
    'User-Agent': DEFAULT_USER_AGENT,
  };
  request.body = JSON.stringify(PORTFOLIO_REQUEST_BODY);

  const payload = await request.loadJSON();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Portfolio API response is empty or invalid');
  }
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    throw new Error(payload.error.trim());
  }

  return {
    timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : null,
    usdToIlsRate: Number(payload.usdToIlsRate),
    targetCurrency: typeof payload.targetCurrency === 'string' ? payload.targetCurrency.toUpperCase() : null,
    summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : null,
    topStocks: Array.isArray(payload.topStocks) ? payload.topStocks : [],
    stocks: Array.isArray(payload.stocks) ? payload.stocks : [],
    weightedPrice: payload.weightedPrice && typeof payload.weightedPrice === 'object' ? payload.weightedPrice : null,
    weightedPrices: payload.weightedPrices && typeof payload.weightedPrices === 'object' ? payload.weightedPrices : null,
  };
}

function resolveMetricColor(value, theme) {
  if (!Number.isFinite(value)) {
    return theme.textSoft;
  }
  if (value > 0) {
    return theme.positive;
  }
  if (value < 0) {
    return theme.negative;
  }
  return theme.neutral;
}

function resolveMetricHex(value, theme) {
  if (!Number.isFinite(value)) {
    return theme.neutralHex;
  }
  if (value > 0) {
    return theme.positiveHex;
  }
  if (value < 0) {
    return theme.negativeHex;
  }
  return theme.neutralHex;
}

function normalizeStockDelta(stock, positionPnLUsd, projectedPnLUsd, usdToIlsRate) {
  let rawValue = null;
  let rawCurrency = null;
  let targetValue = null;
  let targetCurrency = null;

  if (stock?.pnlDelta && typeof stock.pnlDelta === 'object') {
    if (Number.isFinite(Number(stock.pnlDelta.value))) {
      rawValue = Number(stock.pnlDelta.value);
    }
    if (typeof stock.pnlDelta.currency === 'string') {
      rawCurrency = stock.pnlDelta.currency.toUpperCase();
    }
    if (Number.isFinite(Number(stock.pnlDelta.targetValue))) {
      targetValue = Number(stock.pnlDelta.targetValue);
    }
    if (typeof stock.pnlDelta.targetCurrency === 'string') {
      targetCurrency = stock.pnlDelta.targetCurrency.toUpperCase();
    }
  } else if (Number.isFinite(Number(stock?.pnlDelta))) {
    rawValue = Number(stock.pnlDelta);
  }

  if (!rawCurrency && Number.isFinite(rawValue)) {
    rawCurrency = 'USD';
  }

  if (!Number.isFinite(rawValue) && Number.isFinite(positionPnLUsd) && Number.isFinite(projectedPnLUsd)) {
    rawValue = positionPnLUsd - projectedPnLUsd;
    rawCurrency = 'USD';
  }

  let deltaUsd = null;
  let deltaIls = null;
  if (Number.isFinite(rawValue)) {
    if (!rawCurrency || rawCurrency === 'USD') {
      deltaUsd = rawValue;
    } else if (rawCurrency === 'ILS') {
      deltaIls = rawValue;
    }
  }

  if (Number.isFinite(targetValue)) {
    if (targetCurrency === 'USD') {
      deltaUsd = targetValue;
    } else if (targetCurrency === 'ILS') {
      deltaIls = targetValue;
    }
  }

  if (Number.isFinite(deltaUsd) && !Number.isFinite(deltaIls) && Number.isFinite(usdToIlsRate)) {
    deltaIls = deltaUsd * usdToIlsRate;
  }
  if (!Number.isFinite(deltaUsd) && Number.isFinite(deltaIls) && Number.isFinite(usdToIlsRate)) {
    deltaUsd = deltaIls / usdToIlsRate;
  }

  return {
    value: Number.isFinite(rawValue) ? rawValue : deltaUsd,
    currency: rawCurrency || 'USD',
    usd: deltaUsd,
    ils: deltaIls,
  };
}

async function normalizeStock(stock, context) {
  const entryPrice = Number(stock?.entryPrice);
  const quantity = Number(stock?.quantity);
  const hasPosition = Number.isFinite(entryPrice) && Number.isFinite(quantity);
  const currentPrice = Number(stock?.currentPrice ?? stock?.price ?? stock?.quote?.price);
  const entryDate = parseDateValue(stock?.entryDate);
  const priceDelta = hasPosition && Number.isFinite(currentPrice) ? currentPrice - entryPrice : null;

  let currentPnLUsd = Number(stock?.currentPnLUsd);
  if (!Number.isFinite(currentPnLUsd) && Number.isFinite(priceDelta)) {
    currentPnLUsd = priceDelta * quantity;
  }

  let currentPnLIls = Number(stock?.currentPnLIls);
  if (!Number.isFinite(currentPnLIls) && Number.isFinite(currentPnLUsd) && Number.isFinite(context.usdToIlsRate)) {
    currentPnLIls = currentPnLUsd * context.usdToIlsRate;
  }

  let projectedPrice = Number(stock?.projectedPrice);
  if (!Number.isFinite(projectedPrice)) {
    projectedPrice = null;
  }

  let projectedPnLUsd = Number(stock?.projectedPnLUsd);
  if ((!Number.isFinite(projectedPrice) || !Number.isFinite(projectedPnLUsd)) && hasPosition && entryDate) {
    const yearsHeld = calculateYearsHeld(entryDate, context.now);
    if (Number.isFinite(yearsHeld)) {
      const candidateProjectedPrice = entryPrice * Math.pow(1 + ANNUAL_GROWTH_RATE, yearsHeld);
      if (!Number.isFinite(projectedPrice)) {
        projectedPrice = candidateProjectedPrice;
      }
      if (!Number.isFinite(projectedPnLUsd)) {
        projectedPnLUsd = (candidateProjectedPrice - entryPrice) * quantity;
      }
    }
  }
  if (!Number.isFinite(projectedPnLUsd) && Number.isFinite(projectedPrice) && hasPosition) {
    projectedPnLUsd = (projectedPrice - entryPrice) * quantity;
  }

  let projectedPnLIls = Number(stock?.projectedPnLIls);
  if (!Number.isFinite(projectedPnLIls) && Number.isFinite(projectedPnLUsd) && Number.isFinite(context.usdToIlsRate)) {
    projectedPnLIls = projectedPnLUsd * context.usdToIlsRate;
  }

  const delta = normalizeStockDelta(stock, currentPnLUsd, projectedPnLUsd, context.usdToIlsRate);
  const changePercent = Number.isFinite(priceDelta) && Number.isFinite(entryPrice) && entryPrice !== 0
    ? (priceDelta / entryPrice) * 100
    : Number(stock?.changePercent ?? stock?.percentChange ?? stock?.roiPercent ?? stock?.dailyChangePercent);
  const sparklineHistory = context.shouldLoadSparkline
    ? await fetchHistoricalSeriesFromEntry(stock?.symbol, entryDate)
    : null;

  return {
    display: (stock?.display ?? stock?.name ?? stock?.symbol ?? '—').toString(),
    symbol: (stock?.symbol ?? '').toString(),
    currentPrice,
    entryPrice: hasPosition ? entryPrice : null,
    quantity: hasPosition ? quantity : null,
    entryDate,
    currentPnLUsd,
    currentPnLIls,
    projectedPrice,
    projectedPnLUsd,
    projectedPnLIls,
    delta,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    trendValue: Number.isFinite(currentPnLUsd) ? currentPnLUsd : Number.isFinite(priceDelta) ? priceDelta : changePercent,
    sparklineValues: extractSparklineValues(stock, entryPrice, currentPrice, sparklineHistory),
  };
}

function resolveSummary(snapshot, rows, sums, usdToIlsRate, loadError) {
  const source = snapshot?.summary && typeof snapshot.summary === 'object' ? snapshot.summary : null;
  const apiCurrentUsd = Number(source?.totalCurrentPnLUsd);
  const apiCurrentIls = Number(source?.totalCurrentPnLIls);
  const apiGapUsd = Number(source?.totalForecastGapUsd ?? source?.totalCombinedUsd);
  const apiGapIls = Number(source?.totalForecastGapIls ?? source?.totalCombinedIls);
  const apiRate = normalizeUsdToIlsRate(Number(source?.usdToIlsRate));

  const currentUsd = Number.isFinite(apiCurrentUsd)
    ? apiCurrentUsd
    : sums.hasCurrentPnL
      ? sums.currentUsd
      : null;
  let currentIls = Number.isFinite(apiCurrentIls)
    ? apiCurrentIls
    : sums.hasCurrentPnL && Number.isFinite(usdToIlsRate)
      ? sums.currentIls
      : null;
  if (!Number.isFinite(currentIls) && Number.isFinite(currentUsd) && Number.isFinite(usdToIlsRate)) {
    currentIls = currentUsd * usdToIlsRate;
  }

  const gapUsd = Number.isFinite(apiGapUsd)
    ? apiGapUsd
    : sums.hasDelta
      ? sums.deltaUsd
      : null;
  let gapIls = Number.isFinite(apiGapIls)
    ? apiGapIls
    : sums.hasDelta && Number.isFinite(usdToIlsRate)
      ? sums.deltaIls
      : null;
  if (!Number.isFinite(gapIls) && Number.isFinite(gapUsd) && Number.isFinite(usdToIlsRate)) {
    gapIls = gapUsd * usdToIlsRate;
  }

  const missingPriceCount = rows.reduce(
    (count, row) => count + (!Number.isFinite(row.currentPrice) ? 1 : 0),
    0
  );
  const hasValues = Number.isFinite(currentUsd) ||
    Number.isFinite(currentIls) ||
    Number.isFinite(gapUsd) ||
    Number.isFinite(gapIls);

  return {
    currentUsd,
    currentIls,
    gapUsd,
    gapIls,
    usdToIlsRate: Number.isFinite(apiRate) ? apiRate : usdToIlsRate,
    missingPriceCount,
    state: loadError ? 'error' : rows.length === 0 ? 'empty' : hasValues ? 'ready' : 'partial',
  };
}

async function loadPortfolio(layout) {
  let snapshot = null;
  let loadError = null;
  try {
    snapshot = await fetchPortfolioSnapshot();
  } catch (error) {
    logError(`Portfolio API request failed: ${error.message}`);
    loadError = error;
    snapshot = { stocks: [], topStocks: [], summary: null };
  }

  const usdToIlsRate = normalizeUsdToIlsRate(Number(snapshot?.usdToIlsRate));
  const stocksSource = Array.isArray(snapshot?.stocks) && snapshot.stocks.length > 0
    ? snapshot.stocks
    : Array.isArray(snapshot?.topStocks)
      ? snapshot.topStocks
      : [];
  const visibleSource = stocksSource.slice(0, layout.maxRows);
  const rows = [];
  const sums = {
    currentUsd: 0,
    currentIls: 0,
    deltaUsd: 0,
    deltaIls: 0,
    hasCurrentPnL: false,
    hasDelta: false,
  };

  for (let index = 0; index < visibleSource.length; index += 1) {
    const row = await normalizeStock(visibleSource[index], {
      usdToIlsRate,
      now: new Date(),
      shouldLoadSparkline: layout.showSparkline === true,
    });
    rows.push(row);

    if (Number.isFinite(row.currentPnLUsd)) {
      sums.currentUsd += row.currentPnLUsd;
      sums.hasCurrentPnL = true;
    }
    if (Number.isFinite(row.currentPnLIls)) {
      sums.currentIls += row.currentPnLIls;
    }
    if (Number.isFinite(row.delta?.usd)) {
      sums.deltaUsd += row.delta.usd;
      sums.hasDelta = true;
    }
    if (Number.isFinite(row.delta?.ils)) {
      sums.deltaIls += row.delta.ils;
    }
  }

  return {
    timestamp: parseDateValue(snapshot?.timestamp),
    rows,
    summary: resolveSummary(snapshot, rows, sums, usdToIlsRate, loadError),
    loadError,
    totalStockCount: stocksSource.length,
  };
}

function applyPadding(stack, box) {
  stack.setPadding(box.top, box.left, box.bottom, box.right);
}

function addText(stack, text, options = {}) {
  const {
    font = Font.systemFont(12),
    color,
    lineLimit = 1,
    minScale = 0.82,
    align = null,
  } = options;
  const node = stack.addText(String(text ?? ''));
  node.font = font;
  if (color) {
    node.textColor = color;
  }
  node.lineLimit = lineLimit;
  node.minimumScaleFactor = minScale;
  if (align === 'right' && typeof node.rightAlignText === 'function') {
    node.rightAlignText();
  } else if (align === 'left' && typeof node.leftAlignText === 'function') {
    node.leftAlignText();
  } else if (align === 'center' && typeof node.centerAlignText === 'function') {
    node.centerAlignText();
  }
  return node;
}

function addCardStack(parent, options = {}) {
  const stack = parent.addStack();
  stack.layoutVertically();
  stack.cornerRadius = options.cornerRadius ?? 16;
  stack.backgroundColor = options.backgroundColor ?? theme.surfaceMuted;
  stack.borderWidth = options.borderWidth ?? 1;
  stack.borderColor = options.borderColor ?? theme.subtleStroke;
  if (options.shadow !== false) {
    stack.shadowColor = theme.shadow;
    stack.shadowRadius = options.shadowRadius ?? 2;
    stack.shadowOffset = new Point(0, 1);
  }
  if (options.padding) {
    applyPadding(stack, options.padding);
  }
  stack.spacing = options.spacing ?? 2;
  if (options.width) {
    stack.size = new Size(options.width, 0);
  } else {
    stack.size = new Size(0, 0);
  }
  if (options.url) {
    stack.url = options.url;
  }
  return stack;
}

function addSymbolImage(stack, symbolName, size, color) {
  try {
    const symbol = SFSymbol.named(symbolName);
    const image = stack.addImage(symbol.image);
    image.imageSize = new Size(size, size);
    image.tintColor = color;
    image.centerAlignImage();
    return image;
  } catch (error) {
    return null;
  }
}

function addDirectionGlyph(stack, value) {
  const isPositive = Number.isFinite(value) && value > 0;
  const isNegative = Number.isFinite(value) && value < 0;
  const glyph = isPositive ? '▲' : isNegative ? '▼' : '•';
  const color = resolveMetricColor(value, theme);
  addText(stack, glyph, {
    font: Font.semiboldSystemFont(Math.max(9, layout.font.rowMeta)),
    color,
    minScale: 0.9,
  });
}

function addTickerBadge(stack, symbol) {
  const badge = stack.addStack();
  badge.layoutHorizontally();
  badge.centerAlignContent();
  badge.setPadding(1, 5, 1, 5);
  badge.cornerRadius = 7;
  badge.backgroundColor = theme.accentSoft;
  badge.borderWidth = 1;
  badge.borderColor = theme.subtleStroke;
  addText(badge, isolateLtrText((symbol || '—').toUpperCase()), {
    font: Font.mediumSystemFont(layout.font.badge),
    color: theme.accent,
    minScale: 0.75,
  });
}

function drawSparklineImage(values, colorHex, width, height) {
  if (!Array.isArray(values) || values.length < 2) {
    return null;
  }

  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) {
    return null;
  }

  const imageWidth = Math.max(48, Math.round(width));
  const imageHeight = Math.max(16, Math.round(height));
  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const range = Math.max(0.0001, maxValue - minValue);
  const horizontalPadding = 3;
  const verticalPadding = 4;
  const drawableWidth = Math.max(1, imageWidth - horizontalPadding * 2);
  const drawableHeight = Math.max(1, imageHeight - verticalPadding * 2);
  const points = numericValues.map((value, index) => {
    const x = horizontalPadding + (index / Math.max(1, numericValues.length - 1)) * drawableWidth;
    const y = verticalPadding + (1 - (value - minValue) / range) * drawableHeight;
    return new Point(Math.round(x * 2) / 2, Math.round(y * 2) / 2);
  });

  const context = new DrawContext();
  context.size = new Size(imageWidth, imageHeight);
  context.opaque = false;
  context.respectScreenScale = true;

  const baseline = new Path();
  baseline.move(new Point(horizontalPadding, points[0].y));
  baseline.addLine(new Point(imageWidth - horizontalPadding, points[0].y));
  context.addPath(baseline);
  context.setStrokeColor(new Color(colorHex, 0.22));
  context.setLineWidth(1);
  context.strokePath();

  const path = new Path();
  path.move(points[0]);
  for (let index = 1; index < points.length; index += 1) {
    path.addLine(points[index]);
  }
  context.addPath(path);
  context.setStrokeColor(new Color(colorHex, 0.32));
  context.setLineWidth(3.2);
  context.strokePath();

  context.addPath(path);
  context.setStrokeColor(new Color(colorHex, 0.96));
  context.setLineWidth(1.7);
  context.strokePath();

  const last = points[points.length - 1];
  context.setFillColor(new Color(theme.sparklineDotHex ?? '#FFFFFF', 0.92));
  context.fillEllipse(new Rect(last.x - 2.2, last.y - 2.2, 4.4, 4.4));
  context.setFillColor(new Color(colorHex, 1));
  context.fillEllipse(new Rect(last.x - 1.4, last.y - 1.4, 2.8, 2.8));

  return context.getImage();
}

function addMetricValue(stack, label, primary, secondary, valueForColor, options = {}) {
  const column = stack.addStack();
  column.layoutVertically();
  column.spacing = 1;
  column.size = new Size(options.width ?? layout.metricColumnWidth ?? 62, 0);
  if (typeof column.topAlignContent === 'function') {
    column.topAlignContent();
  }

  addText(column, label, {
    font: Font.mediumSystemFont(layout.font.rowMeta),
    color: theme.textSoft,
    align: 'right',
    minScale: 0.86,
  });
  addText(column, primary, {
    font: Font.semiboldSystemFont(layout.font.rowValue),
    color: resolveMetricColor(valueForColor, theme),
    align: 'right',
    minScale: 0.72,
  });
  if (secondary) {
    addText(column, secondary, {
      font: Font.systemFont(layout.font.rowMeta),
      color: theme.textMuted,
      align: 'right',
      minScale: 0.72,
    });
  }

  return column;
}

function addHeader(parent, portfolio) {
  const header = parent.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  header.spacing = layout.headerSpacing;
  header.size = new Size(0, 0);

  const icon = () => {
    const iconWrap = header.addStack();
    const iconSize = layout.widgetFamily === 'small' ? 22 : 26;
    iconWrap.size = new Size(iconSize, iconSize);
    iconWrap.cornerRadius = iconSize / 2;
    iconWrap.backgroundColor = theme.accentSoft;
    iconWrap.borderWidth = 1;
    iconWrap.borderColor = theme.subtleStroke;
    iconWrap.centerAlignContent();
    if (!addSymbolImage(iconWrap, 'chart.line.uptrend.xyaxis', Math.round(iconSize * 0.52), theme.accent)) {
      addText(iconWrap, '↗', {
        font: Font.semiboldSystemFont(Math.round(iconSize * 0.48)),
        color: theme.accent,
        align: 'center',
      });
    }
  };

  const title = () => {
    const textStack = header.addStack();
    textStack.layoutVertically();
    textStack.spacing = 0;
    textStack.size = new Size(0, 0);

    addText(textStack, isolateLtrText('LiveStocks'), {
      font: Font.semiboldSystemFont(layout.font.headerTitle),
      color: theme.text,
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.82,
    });

    if (layout.showTimestamp !== false) {
      addText(textStack, getTimestampLabel(portfolio.timestamp, layout.compactSlot), {
        font: Font.systemFont(layout.font.headerMeta),
        color: portfolio.loadError ? theme.negative : theme.textMuted,
        align: isRtlLayout ? 'right' : 'left',
        minScale: 0.78,
      });
    }
  };

  if (isRtlLayout) {
    header.addSpacer();
    title();
    icon();
  } else {
    icon();
    title();
    header.addSpacer();
  }
}

function resolvePrimarySummaryValue(usdValue, ilsValue) {
  if (Number.isFinite(ilsValue)) {
    return {
      value: ilsValue,
      symbol: ILS_SYMBOL,
      secondary: Number.isFinite(usdValue) ? formatSignedMoney(usdValue, '$', true) : null,
    };
  }
  if (Number.isFinite(usdValue)) {
    return {
      value: usdValue,
      symbol: '$',
      secondary: null,
    };
  }
  return null;
}

function addSummaryCard(parent, item, options = {}) {
  const primary = resolvePrimarySummaryValue(item.usd, item.ils);
  const toneValue = primary?.value;
  const card = addCardStack(parent, {
    width: options.width,
    cornerRadius: options.cornerRadius ?? 14,
    padding: options.padding ?? layout.summaryPadding,
    backgroundColor: options.backgroundColor ?? theme.surfaceMuted,
    spacing: 1,
    shadow: options.shadow,
  });

  addText(card, item.label, {
    font: Font.mediumSystemFont(layout.font.summaryLabel),
    color: theme.textMuted,
    align: 'center',
    minScale: 0.82,
  });
  addText(card, primary ? formatSignedMoney(primary.value, primary.symbol, true) : '—', {
    font: Font.semiboldSystemFont(options.valueSize ?? layout.font.summaryValue),
    color: resolveMetricColor(toneValue, theme),
    align: 'center',
    minScale: options.minScale ?? 0.68,
  });

  if (layout.showSecondarySummary && primary?.secondary) {
    addText(card, primary.secondary, {
      font: Font.systemFont(layout.font.summaryMeta),
      color: theme.textSoft,
      align: 'center',
      minScale: 0.78,
    });
  }

  return card;
}

function addSummary(parent, summary) {
  if (layout.summaryMode === 'hero') {
    const primary = resolvePrimarySummaryValue(summary.currentUsd, summary.currentIls);
    const gap = resolvePrimarySummaryValue(summary.gapUsd, summary.gapIls);
    const hero = addCardStack(parent, {
      cornerRadius: Math.max(16, layout.cornerRadius - 6),
      padding: layout.summaryPadding,
      spacing: 2,
      backgroundColor: theme.surfaceMuted,
    });
    hero.url = widgetTapUrl || refreshUrl;

    addText(hero, 'רווח/הפסד נוכחי', {
      font: Font.mediumSystemFont(layout.font.summaryLabel),
      color: theme.textMuted,
      align: 'center',
      minScale: 0.82,
    });
    addText(hero, primary ? formatSignedMoney(primary.value, primary.symbol, true) : '—', {
      font: Font.semiboldSystemFont(layout.font.summaryValue),
      color: resolveMetricColor(primary?.value, theme),
      align: 'center',
      minScale: 0.58,
    });
    addText(hero, gap ? `פער יעד ${formatSignedMoney(gap.value, gap.symbol, true)}` : 'פער יעד —', {
      font: Font.systemFont(layout.font.summaryMeta),
      color: resolveMetricColor(gap?.value, theme),
      align: 'center',
      minScale: 0.72,
    });
    return;
  }

  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = Math.max(6, layout.contentSpacing);
  row.size = new Size(0, 0);

  const cards = [
    {
      label: 'רווח נוכחי',
      usd: summary.currentUsd,
      ils: summary.currentIls,
    },
    {
      label: 'פער מול יעד',
      usd: summary.gapUsd,
      ils: summary.gapIls,
    },
  ];

  if (isRtlLayout) {
    row.addSpacer();
  }
  cards.forEach((item, index) => {
    if (index > 0) {
      row.addSpacer(Math.max(4, Math.floor(layout.contentSpacing / 2)));
    }
    addSummaryCard(row, item, {
      width: layout.summaryCardWidth,
      padding: layout.summaryPadding,
    });
  });
  if (!isRtlLayout) {
    row.addSpacer();
  }
}

function addSmallStockChip(parent, stock) {
  const chip = addCardStack(parent, {
    cornerRadius: 14,
    padding: layout.rowPadding,
    spacing: 0,
    backgroundColor: theme.surface,
    shadow: false,
  });
  chip.url = widgetTapUrl || refreshUrl;

  const row = chip.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 5;

  const info = () => {
    const infoStack = row.addStack();
    infoStack.layoutVertically();
    infoStack.spacing = 0;
    infoStack.size = new Size(0, 0);
    addText(infoStack, stock.display, {
      font: Font.semiboldSystemFont(layout.font.rowName),
      color: theme.text,
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.76,
    });
    addText(infoStack, `${isolateLtrText(stock.symbol || '—')} · ${formatSignedPercent(stock.changePercent)}`, {
      font: Font.systemFont(layout.font.rowMeta),
      color: resolveMetricColor(stock.trendValue, theme),
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.76,
    });
  };

  const value = () => {
    const valueStack = row.addStack();
    valueStack.layoutVertically();
    valueStack.spacing = 0;
    valueStack.size = new Size(58, 0);
    addText(valueStack, Number.isFinite(stock.currentPrice) ? formatMoney(stock.currentPrice) : '—', {
      font: Font.semiboldSystemFont(layout.font.rowValue),
      color: theme.text,
      align: 'right',
      minScale: 0.68,
    });
    addText(valueStack, Number.isFinite(stock.currentPnLIls)
      ? formatSignedMoney(stock.currentPnLIls, ILS_SYMBOL, true)
      : formatSignedMoney(stock.currentPnLUsd, '$', true), {
      font: Font.systemFont(layout.font.rowMeta),
      color: resolveMetricColor(stock.currentPnLUsd, theme),
      align: 'right',
      minScale: 0.68,
    });
  };

  if (isRtlLayout) {
    value();
    row.addSpacer(4);
    info();
  } else {
    info();
    row.addSpacer(4);
    value();
  }
}

function addStateBlock(parent, summary, loadError = null) {
  const configByState = {
    error: {
      title: 'לא ניתן לטעון נתונים',
      body: 'ננסה שוב אוטומטית בעוד 15 דקות',
      symbol: 'wifi.exclamationmark',
      color: theme.negative,
    },
    empty: {
      title: 'אין עדיין מניות להצגה',
      body: 'הוסיפו פוזיציות בדשבורד',
      symbol: 'tray.fill',
      color: theme.textMuted,
    },
    partial: {
      title: 'הנתונים חלקיים כרגע',
      body: 'מציגים את המידע הזמין',
      symbol: 'exclamationmark.circle',
      color: theme.neutral,
    },
  };
  const state = configByState[summary?.state] ?? configByState.partial;
  const block = addCardStack(parent, {
    cornerRadius: Math.max(14, layout.cornerRadius - 8),
    padding: {
      top: layout.widgetFamily === 'small' ? 8 : 12,
      left: 12,
      bottom: layout.widgetFamily === 'small' ? 8 : 12,
      right: 12,
    },
    spacing: 4,
    backgroundColor: theme.surface,
  });
  block.url = widgetTapUrl || refreshUrl;

  const row = block.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 8;

  const icon = () => {
    const iconWrap = row.addStack();
    const size = layout.widgetFamily === 'small' ? 20 : 26;
    iconWrap.size = new Size(size, size);
    iconWrap.cornerRadius = size / 2;
    iconWrap.backgroundColor = theme.accentSoft;
    iconWrap.centerAlignContent();
    if (!addSymbolImage(iconWrap, state.symbol, Math.round(size * 0.54), state.color)) {
      addText(iconWrap, '!', {
        font: Font.semiboldSystemFont(Math.round(size * 0.5)),
        color: state.color,
        align: 'center',
      });
    }
  };

  const copy = () => {
    const text = row.addStack();
    text.layoutVertically();
    text.spacing = 1;
    text.size = new Size(0, 0);
    addText(text, state.title, {
      font: Font.semiboldSystemFont(layout.font.stateTitle),
      color: theme.text,
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.78,
    });
    addText(text, loadError?.message ? state.body : state.body, {
      font: Font.systemFont(layout.font.stateBody),
      color: theme.textMuted,
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.76,
    });
  };

  if (isRtlLayout) {
    row.addSpacer();
    copy();
    icon();
  } else {
    icon();
    copy();
    row.addSpacer();
  }
}

function addStockInfo(parent, stock) {
  const info = parent.addStack();
  info.layoutVertically();
  info.spacing = 1;
  info.size = new Size(layout.infoWidth ?? 120, 0);
  if (typeof info.topAlignContent === 'function') {
    info.topAlignContent();
  }

  const titleRow = info.addStack();
  titleRow.layoutHorizontally();
  titleRow.centerAlignContent();
  titleRow.spacing = 4;

  const nameText = () => addText(titleRow, stock.display, {
    font: Font.semiboldSystemFont(layout.font.rowName),
    color: theme.text,
    align: isRtlLayout ? 'right' : 'left',
    minScale: 0.68,
  });

  if (isRtlLayout) {
    titleRow.addSpacer();
    addTickerBadge(titleRow, stock.symbol);
    nameText();
    addDirectionGlyph(titleRow, stock.trendValue);
  } else {
    addDirectionGlyph(titleRow, stock.trendValue);
    nameText();
    addTickerBadge(titleRow, stock.symbol);
    titleRow.addSpacer();
  }

  const metaParts = [];
  const quantity = formatQuantity(stock.quantity);
  if (layout.showEntryDetails && quantity) {
    metaParts.push(`כמות ${quantity}`);
  }
  if (layout.showEntryDetails && Number.isFinite(stock.entryPrice)) {
    metaParts.push(`כניסה ${formatMoney(stock.entryPrice)}`);
  }

  const primaryMeta = metaParts.length > 0
    ? metaParts.join(' · ')
    : `שינוי ${formatSignedPercent(stock.changePercent)}`;
  addText(info, primaryMeta, {
    font: Font.systemFont(layout.font.rowMeta),
    color: theme.textMuted,
    align: isRtlLayout ? 'right' : 'left',
    minScale: 0.68,
  });

  if (layout.showEntryDetails && stock.entryDate) {
    addText(info, `מתאריך ${formatDateOnly(stock.entryDate)}`, {
      font: Font.systemFont(layout.font.rowMeta),
      color: theme.textSoft,
      align: isRtlLayout ? 'right' : 'left',
      minScale: 0.68,
    });
  }
}

function addSparkline(parent, stock) {
  if (layout.showSparkline !== true) {
    return;
  }

  const wrap = parent.addStack();
  wrap.layoutVertically();
  wrap.centerAlignContent();
  wrap.size = new Size(layout.sparklineWidth, 0);
  const image = drawSparklineImage(
    stock.sparklineValues,
    resolveMetricHex(stock.trendValue, theme),
    layout.sparklineWidth,
    layout.sparklineHeight
  );

  if (image) {
    const imageNode = wrap.addImage(image);
    imageNode.imageSize = new Size(layout.sparklineWidth, layout.sparklineHeight);
    imageNode.centerAlignImage();
  } else {
    addText(wrap, '—', {
      font: Font.systemFont(layout.font.rowMeta),
      color: theme.textSoft,
      align: 'center',
    });
  }
}

function addStockMetrics(parent, stock) {
  const metrics = parent.addStack();
  metrics.layoutHorizontally();
  metrics.spacing = 6;
  metrics.size = new Size(layout.metricsWidth ?? 126, 0);
  if (typeof metrics.topAlignContent === 'function') {
    metrics.topAlignContent();
  }

  addMetricValue(
    metrics,
    'נוכחי',
    Number.isFinite(stock.currentPrice) ? formatMoney(stock.currentPrice) : '—',
    Number.isFinite(stock.currentPnLIls)
      ? formatSignedMoney(stock.currentPnLIls, ILS_SYMBOL, true)
      : formatSignedMoney(stock.currentPnLUsd, '$', true),
    Number.isFinite(stock.currentPnLUsd) ? stock.currentPnLUsd : stock.currentPnLIls
  );

  if (layout.showTargetColumn) {
    addMetricValue(
      metrics,
      'יעד',
      Number.isFinite(stock.projectedPrice) ? formatMoney(stock.projectedPrice) : '—',
      Number.isFinite(stock.delta?.ils)
        ? formatSignedMoney(stock.delta.ils, ILS_SYMBOL, true)
        : formatSignedMoney(stock.delta?.usd, currencySymbolForCode(stock.delta?.currency), true),
      Number.isFinite(stock.delta?.usd) ? stock.delta.usd : stock.delta?.ils
    );
  }
}

function addStockRow(parent, stock) {
  const shell = addCardStack(parent, {
    cornerRadius: Math.max(14, layout.cornerRadius - 8),
    padding: layout.rowPadding,
    spacing: 0,
    backgroundColor: theme.surface,
    shadow: false,
  });
  shell.url = widgetTapUrl || refreshUrl;

  const row = shell.addStack();
  row.layoutHorizontally();
  row.spacing = Math.max(5, Math.floor(layout.contentSpacing * 0.75));
  row.centerAlignContent();

  if (isRtlLayout) {
    addStockMetrics(row, stock);
    if (layout.showSparkline) {
      addSparkline(row, stock);
    }
    addStockInfo(row, stock);
  } else {
    addStockInfo(row, stock);
    if (layout.showSparkline) {
      addSparkline(row, stock);
    }
    addStockMetrics(row, stock);
  }
}

function configureWidgetBackground(widget) {
  if ('useDefaultPadding' in widget) {
    widget.useDefaultPadding = false;
  }
  widget.setPadding(layout.widgetPadding, layout.widgetPadding, layout.widgetPadding, layout.widgetPadding);

  const gradient = new LinearGradient();
  gradient.colors = theme.gradientColors;
  gradient.locations = theme.gradientLocations;
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;

  if (widgetTapUrl) {
    widget.url = widgetTapUrl;
  } else if (refreshUrl) {
    widget.url = refreshUrl;
  }
}

function buildWidget(portfolio) {
  const widget = new ListWidget();
  configureWidgetBackground(widget);

  const root = widget.addStack();
  root.layoutVertically();
  root.size = new Size(0, 0);
  root.cornerRadius = layout.cornerRadius;
  root.backgroundColor = theme.surface;
  root.borderWidth = 1;
  root.borderColor = theme.stroke;
  root.shadowColor = theme.shadow;
  root.shadowRadius = 5;
  root.shadowOffset = new Point(0, 2);
  applyPadding(root, layout.cardPadding);
  root.spacing = layout.contentSpacing;

  addHeader(root, portfolio);

  if (portfolio.summary.state !== 'error') {
    addSummary(root, portfolio.summary);
  }

  if (portfolio.rows.length === 0) {
    addStateBlock(root, portfolio.summary, portfolio.loadError);
  } else if (layout.widgetFamily === 'small') {
    addSmallStockChip(root, portfolio.rows[0]);
  } else {
    const rowsStack = root.addStack();
    rowsStack.layoutVertically();
    rowsStack.spacing = layout.rowSpacing;
    rowsStack.size = new Size(0, 0);
    portfolio.rows.forEach((stock) => addStockRow(rowsStack, stock));
  }

  if (portfolio.summary.state === 'error') {
    addStateBlock(root, portfolio.summary, portfolio.loadError);
  }

  if (
    layout.widgetFamily !== 'small' &&
    portfolio.summary.state === 'ready' &&
    Number.isFinite(portfolio.summary.usdToIlsRate)
  ) {
    const footer = root.addStack();
    footer.layoutHorizontally();
    footer.centerAlignContent();
    footer.addSpacer();
    addText(footer, isolateLtrText(`USD/ILS ${portfolio.summary.usdToIlsRate.toFixed(2)}`), {
      font: Font.systemFont(layout.font.headerMeta),
      color: theme.textSoft,
      align: 'center',
      minScale: 0.8,
    });
    footer.addSpacer();
  }

  widget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL_MINUTES * 60 * 1000);
  return widget;
}

async function presentWidget(widgetFamily, widget) {
  const runsInWidget = typeof config === 'object' && config.runsInWidget === true;
  if (runsInWidget) {
    return;
  }

  if (widgetFamily === 'small' && typeof widget.presentSmall === 'function') {
    await widget.presentSmall();
    return;
  }
  if (widgetFamily === 'large' && typeof widget.presentLarge === 'function') {
    await widget.presentLarge();
    return;
  }
  if (widgetFamily === 'extraLarge' && typeof widget.presentExtraLarge === 'function') {
    await widget.presentExtraLarge();
    return;
  }
  await widget.presentMedium();
}

function getRefreshUrl() {
  try {
    return typeof URLScheme !== 'undefined' && typeof URLScheme.forRunningScript === 'function'
      ? URLScheme.forRunningScript()
      : '';
  } catch (error) {
    return '';
  }
}

const widgetFamily = getWidgetFamily();
const deviceProfile = getDeviceProfile();
const layout = resolveLayout(widgetFamily, deviceProfile);
const theme = createTheme(resolveThemeAppearance(), deviceProfile.isDarkAppearance);
const isRtlLayout = detectRtlLocale();
const portfolioBaseUrl = resolvePortfolioBaseUrl();
const portfolioApiUrl = `${portfolioBaseUrl}/api/portfolio`;
const refreshUrl = getRefreshUrl();
const widgetTapUrl = `${portfolioBaseUrl}/`;

const portfolio = await loadPortfolio(layout);
const widget = buildWidget(portfolio);
Script.setWidget(widget);
await presentWidget(widgetFamily, widget);
Script.complete();
