# LiveStocks widget v7 — 2026-11-03

Installed in Scriptable iCloud Documents and byte-verified against this distribution copy. Previous v6 is backed up there as Stocks Status.before-v7-2026-11-03.txt. iPhone sync and native rendering are not verified.

All sizes now show net profit/loss and the forecast gap together. The authoritative summary.totalForecastGapIls/Usd field is used; when unavailable, fallback subtracts totalProjectedPnL from totalNetPnL in the same currency only when both exist. Positive means above forecast; negative below. Missing data stays unavailable. This is the personal compound growth target accrued to today, not an analyst price forecast. API defaults for rates/quotes are unchanged.

Small/medium always show portfolio value plus both requested metrics. Large/extraLarge retain the mode=pnl hero option. Large metric rail replaces winner/loser counts with P/L and forecast gap; ticker badges removed for space.

Validation: 222 assertions, 36 mock renders. 24 baseline size/theme/forecast-state browser checks passed before final spacing refinement. Source-driven browser previews use sample data and approximate native rendering; concentration ring drawing is approximate. No native Liquid Glass compatibility claim.

Run: node widget-v7-test.cjs
Generate preview: node widget-v7-preview.cjs
