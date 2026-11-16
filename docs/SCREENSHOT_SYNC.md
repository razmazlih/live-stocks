# Screenshot reconciliation

## User flow

A user uploads a holdings screenshot in ChatGPT. Host vision extracts clear values, asks once about blocking ambiguity, and calls prepare_screenshot_sync. The result opens a compact MCP App review **inside ChatGPT** with account, observation date, before/after quantities/costs and known or estimated dates. One human button click confirms; Cancel cancels. No website review or final approval is needed. No screenshot, OCR vendor or server model is involved.

Acquisition dates are optional. A short chat answer or transaction screenshot can supply a real date. The existing bounded history helper can suggest a price-match date (0.5% daily-range tolerance, up to five years). An estimate is stored separately and never establishes original FIFO lots, acquisition FX or holding age. Missing dates and optional lookup outages do not block the fast path. Corrections call prepare_screenshot_sync with previousProposalId and invalidate the old card, including blocked/no-op corrections.

New, existing, previously closed, and consolidated holdings are supported. Existing quantity and cost changes are not blocked merely because they differ from recorded history. Explicit zero rows clear an observed balance; omitted symbols never mean zero. Positive balances require a known fee-inclusive USD cost. A screenshot preceding any recorded event for that instrument/account is rejected; it must not undo later real trades. Mixed accounts require separate proposals.

## Accounting model

A screenshot provides an observation, not an execution. Each changed instrument receives an immutable `RECONCILE` position-lot event at the observation date, carrying absolute target quantity, fee-inclusive USD average basis, optional verified `basis_acquired_on`, optional separately labeled `basis_date_estimate`, and creation time. This is an accounting checkpoint, not a buy, sale, deposit or taxable event.

- Every historical BUY/SELL lot remains byte-for-byte unchanged. Prior realized sale calculations retain their recorded proceeds, FIFO basis and profit.
- At the checkpoint, the open FIFO queue resets to the observed quantity and basis. Zero clears the queue without generating proceeds, realized profit, fees or tax.
- Later real BUY/SELL lots extend or consume the new FIFO queue normally. A sale consuming snapshot basis carries `basisSource:reconciled_average` and is labeled accordingly: the average-cost screenshot cannot prove the broker’s original tax-lot FIFO. Legacy same-day trade order is preserved before the first checkpoint; checkpoints separate earlier/later events, and subsequent same-day events use creation time; future inserts use `clock_timestamp()` so same-day trades after confirmation occur after the checkpoint. Unknown original dates never use observation-day FX as acquisition FX.
- A later corrected screenshot appends another checkpoint. Checkpoints cannot be edited/deleted through normal writers; review the next before/after balance and append a correction. Account merge may change only the owning profile under its existing executor boundary.
- Multiple ledgers left by account merge are reconciled as one instrument/account balance: the canonical ledger gets the target checkpoint, the other ledgers get explicit zero checkpoints in the same transaction. All their histories remain available; quantities are not multiplied across ledgers.
- Holdings with no lot ledger retain their original metadata; the checkpoint supersedes only the currently open balance, without fabricating prior trades.

### Example

Recorded history: buy 10 at $100, sell 2 at $120. Recorded realized gain remains $40 and the recorded open balance was 8 at $100. A current screenshot shows 5 at $110. Confirmation appends a checkpoint of 5 at $110; current value at a $130 quote is $650 and open gain is $100. It does **not** infer a sale of 3 shares, sale proceeds or another realized gain. A later actual sale of 2 at $130 has a $220 basis and $40 gross gain before its recorded fee. The earlier $40 sale remains intact, but lifetime gain/tax is incomplete because the screenshot does not explain the missing executions.

## Truthful metrics

Current quantity, current USD valuation, fee-inclusive current cost and open USD gain remain calculable. Recorded realized sales remain visible as recorded subtotals. A snapshot cannot reveal missing disposal proceeds, commissions, tax or cash flows, so affected complete historical/cumulative returns and total tax are unavailable rather than zero or guessed. Unknown basis dates also leave holding age, annualized targets and acquisition-date FX unavailable. Reconciled instruments are excluded from complete-history close-group screening. Historical chart paths do not bridge a checkpoint into an invented investment return.

## Isolation, atomicity and replay

### Limited OAuth capability

Default OAuth grants and existing refresh families remain read-only. The optional portfolio:sync capability requires an explicit operator allowlist change for the existing MCP client and a new user-consented OAuth request. It does not add portfolio:write. The access token keeps the read_only claim true, and ordinary RLS INSERT/UPDATE/DELETE remains denied. Website credentials claiming the sync scope are rejected.

Only the fixed confirmation dispatcher can enter a dedicated NOLOGIN/NOINHERIT/NOBYPASSRLS executor. It has owner-bound SELECT/INSERT policies and a trigger fence allowing only checkpoint inserts and exact preservation of an already-recorded legacy opening balance. General UPDATE/DELETE, trading, plans, settings and credentials remain inaccessible. All SECURITY DEFINER functions have an empty search path, explicit EXECUTE grants and live owner/session/grant checks; the role cannot create functions or be assumed by authenticated callers.

### Exact persisted review and human interaction

The private RLS-protected proposal table stores immutable expected fingerprint, rows, review, expiry, canonical owner, raw subject, session, client, OAuth approval and a SHA256 confirmation-secret hash. Read RPCs omit the hash and financial payload not needed for review. Each proposal expires after 15 minutes. Corrections atomically supersede a pending proposal; explicit cancellation persists. Even blocked/no-op corrections invalidate the prior card.

The server returns only review data and proposal ID in content/structuredContent. A random 256-bit confirmation capability goes exclusively in result _meta, documented as hidden from the model and available to the embedded app. confirm_screenshot_sync and cancel_screenshot_sync use ui.visibility:[app] and accept only proposal ID plus that capability—no editable holdings, owner ID or invented confirmed boolean. The UI sends it only after an actual button click, never automatically, and does not put it in DOM, logs, storage, URLs or model context. Source===parent checks, request correlation and proposal generations prevent stale/foreign iframe replies from completing a different card.

The trust boundary is a compliant MCP/ChatGPT host and the approved OAuth client. MCP annotations alone do not prove a human click and there is no server-verifiable human-click signature; the private capability and app-only tool keep the language model out of final execution. Do not claim synthetic-host tests establish actual ChatGPT behavior.

### Atomicity, isolation and replay

Confirm revalidates live signed scope, canonical identity, session, grant, client, connection cutoff and account fence, then locks the exact saved proposal. It applies only its stored rows after comparing the full current portfolio fingerprint. Bounded locks and checkpoint inserts share the transaction with the saved receipt/status; failures roll back everything. Wrong owner/session/grant/client, missing scope/secret, cancelled/superseded/expired drafts, stale snapshots and backdated observations fail closed. An exact retry of an already-applied proposal returns its stored receipt without reapplying, even if unrelated portfolio edits happened later.

The legacy website screen remains a separate manual fallback protected by website-only writes; the ChatGPT path does not call it or reveal its encrypted review URL.

## Verification and release

Run Vitest, TypeScript, ESLint, production build, the Scriptable suite, python3 scripts/test-screenshot-sync-postgres.py, and python3 scripts/test-better-auth-postgres.py. The SQL fixture applies all migrations and verifies persisted review, exact execution, private secret handling, cross-owner/session/grant denial, read-only denial, direct-write denial, supersession, cancel, expiry, revocation, stale/backdated rejection, receipt replay, rollback and preservation of historical lots. Its identity helper is synthetic. The separate Better Auth fixture uses the real provider SDK for explicit optional-scope registration, signed consent, access/refresh issuance, old read-only grants, and refresh escalation denial.

Release the migrations and compatible readers/writers together. Explicitly review and apply the existing seeder with --enable-portfolio-sync to opt the client into the optional scope (see docs/CHATGPT_ACTIVATION.md); never widen existing grants or silently add general write. Refresh the existing App tools, publish the skill through its established process, and accept the optional scope through user consent. Preserve App/plugin/client IDs, callbacks, secrets, workspace sharing and approved icon assets. No production migration, OAuth allowlist change, plugin publication or real-user import is performed by this PR.

**Unverified:** actual ChatGPT rendering, metadata isolation and app-only tool confirmation after OAuth upgrade. Desktop/mobile browser tests use a synthetic MCP host and are not a physical-phone or live ChatGPT acceptance test.

## Recorded verification

Current test totals and native runs are recorded in the PR description. Synthetic browser checks cover no automatic writes, private secret absent DOM, exact button arguments, confirmed success/cancel and a 390px mobile layout without page overflow. Unit tests cover stale proposal reply isolation and actual/estimated date labels. No real screenshot or personal financial data appears in these artifacts.

![Synthetic inline desktop review](screenshots/chat-sync-desktop.png)

![Synthetic inline mobile review](screenshots/chat-sync-mobile.png)
