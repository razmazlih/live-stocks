# LiveStocks development guide

LiveStocks is a Next.js App Router portfolio tracker with Hebrew RTL and English LTR. The browser UI, HTTP API, ChatGPT MCP, and Scriptable widget share account-scoped portfolio data. Use the table to open the files for the task and their adjacent tests.

| Task | Start here | Focused verification |
| --- | --- | --- |
| Overview and performance | `app/portfolio/page.tsx`, `hooks/use-portfolio-data.ts`, `app/api/portfolio/dashboard/route.ts` | `__tests__/portfolio-data.test.tsx`, `__tests__/portfolio-timeline.test.ts` |
| Holdings, trades and FIFO | `app/positions/page.tsx`, `lib/positions.ts`, `lib/calculations.ts` | `__tests__/portfolio-commissions.test.ts`, `__tests__/reconciliation-portfolio-response.test.ts` |
| Quotes, watchlist and charts | `app/watchlist/page.tsx`, `app/stock/[symbol]/page.tsx`, `app/api/candles/route.ts`, `components/charts/sparkline.tsx` | Search `__tests__` for `sparkline`, `watchlist` or `candle` |
| Auth, login and account settings | `proxy.ts`, `app/settings/page.tsx`, `lib/auth/better-auth.ts`, `lib/auth/server.ts` | `docs/BETTER_AUTH_SETUP.md`, `docs/ACCOUNT_LINKING.md` |
| ChatGPT tools and OAuth | `app/api/mcp/route.ts`, `app/oauth/consent/page.tsx`, `plugins/livestocks-oauth/README.md` | `docs/CHAT_TRANSACTION_AUTH.md` and MCP tests in `__tests__` |
| iOS widget | `app/api/widget/summary/route.ts`, `output/widget/Stocks Status.js` | `output/widget/README.md` |
| Local demo and fixtures | `app/api/local-demo/route.ts`, `lib/demo/`, `scripts/dev.mjs` | `__tests__/demo-disk-api.test.ts`, `__tests__/demo-ledger.test.ts` |
| Layout and locale | `app/layout.tsx`, `app/globals.css`, `lib/translations.ts` | Compare Hebrew/English, mobile/desktop and light/dark for visible work |
| Database and tenancy | `supabase/migrations/`, `lib/server/portfolio-response.ts` | `scripts/test-tenancy.py` and the relevant setup guide |

Use `rg --files app components hooks lib __tests__` to locate the smallest relevant slice. Read the relevant runbook before working with account setup, recovery or deployment. Use `git log -- <path>` for historical context.

Run `npm ci` and `npm run dev`. For UI checks, set `LIVESTOCKS_DEMO_DATA_DIR` to a fresh temporary directory and enter via the local sign-in page. The loopback demo supplies synthetic prices and transactions. Keep secrets and personal account data out of fixtures, logs and screenshots.

Run focused tests with `npm test -- <test-path>`. Before delivery run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`. Keep commits focused and refresh README screenshots when the pictured UI changes.
