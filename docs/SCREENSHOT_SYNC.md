# Screenshot reconciliation

## Product contract

A user uploads a holdings screenshot in ChatGPT. Host vision extracts structured observations, asks about ambiguity, and prepares a same-owner review link. No server model, image upload, public search of private holdings, or OCR vendor is needed. The authenticated website shows brokerage location, observation date, ticker, quantity, cost and original acquisition date before the user confirms.

This PR deliberately supports new opening holdings and matching existing holdings. It **does not yet synchronize changed quantities/costs against an existing trade history**. That requires actual execution details or a separately designed reconciliation accounting model; inventing BUY/SELL events would corrupt FIFO, realized gains and tax estimates. Closed and consolidated historical positions also count as existing. Multiple executions cannot be recovered from an average-cost screenshot; ask for actual history. Cost must include existing commissions; no extra default commission is charged.

Missing rows are untouched, accounts remain separate, blocked rows prevent all imports, and a stale observation must be replaced by a current one. `observedAt` describes the screenshot; it does not establish broker freshness. The host must ask before interpreting an old or ambiguous screenshot.

## Architecture and isolation

- Existing MCP OAuth remains `portfolio:read`; `prepare_screenshot_sync` only reads the RLS-scoped database snapshot and constructs a proposal.
- AES-256-GCM envelopes use a domain-separated key derived from the existing Better Auth secret. They bind the canonical owner, validated input, immutable lot IDs, snapshot fingerprint, eligible symbols and a 15-minute expiry. Secret rotation invalidates pending links.
- The URL fragment carries the encrypted proposal and is cleared after reading. It is not sent in HTTP access logs or referrers. Users must reopen the original chat link after reload/sign-in; the proposal is intentionally not put in local storage.
- Review and apply use same-origin POST and `requireWebPrincipal`. MCP bearer tokens cannot call the website write route. Invalid/wrong-owner/tampered/expired proposals fail closed.
- Snapshot SQL is security invoker and returns all RLS-visible owner positions and lots. Apply uses existing website writer authorization, bounded locks, snapshot comparison and a single transaction. No administrator data client is involved.
- Per-row UUIDs make an uncertain-response retry idempotent, with exact row matching. The SQL function rejects changed payloads and existing symbols, including historical and consolidated ledgers. Concurrent changes require a fresh proposal.

## Acceptance and release

Run planner, envelope, endpoint and native database tests; typecheck, lint and build. Native tests must prove authenticated owner reads, MCP/anonymous write denial, cross-owner isolation, transaction rollback, stale rejection and exact replay. Apply migration only through the existing reviewed release process. Refresh tools and publish the existing OAuth skill package afterward; preserve App/plugin IDs, OAuth scopes, workspace sharing and approved icon assets. No live account imports or plugin publication are part of this PR.

A real ChatGPT screenshot-to-website confirmation remains a release acceptance check, including mobile layout and sign-in return. Automated tests must not be described as a real host or physical-phone test.

## Verification recorded for this PR

- Full Vitest run: 906 passed, 3 existing native integration tests skipped; the added Strict Mode UI regression was then tested separately (1 passed).
- TypeScript, ESLint and production build passed. Browser-support datasets emitted existing age notices.
- `python3 scripts/test-screenshot-sync-postgres.py`: passed disposable PostgreSQL tests against all migrations. Fixture identity resolution is synthetic; no production account or real ChatGPT OAuth import was exercised.
- Independent review corrected Strict Mode fragment replay and aligned the schema's minimum date with SQL.

## Remaining complete-sync milestone

For an existing holding discrepancy, the next implementation needs an execution-details continuation: collect actual missing BUY/SELL dates, quantities, fees and prices; preview the resulting FIFO ledger; validate its final quantity/cost against the observation; confirm the entire batch under the same freshness/owner boundary. If actual history is unavailable, a separately modeled non-trading reconciliation event must be designed across holdings, returns, FIFO and tax views. Neither case can be accurately inferred from a screenshot alone. Do not label this PR a complete replacement/update synchronization implementation.
