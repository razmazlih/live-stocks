# OAuth screenshot-sync reconnect investigation — 2026-11-16

## Evidence and root-cause boundary

Reading works while preparation needs an additional `portfolio:sync` scope. The
production registration evidence in
`verification/chat-sync-production-oauth-2026-11-16.json` records expanding the
client's allowed scopes without upgrading existing grants. This is intentional:
only an explicit human authorization can add sync to an existing connection.

Two server protocol defects were reproduced with synthetic route tests:

1. Missing sync permission returned HTTP 200 for every protocol, with only an
   Apps tool-result challenge. Modern MCP 2026-07-28 clients need HTTP 403 and
   `WWW-Authenticate: Bearer ... error="insufficient_scope"` to drive step-up.
2. A rejected bearer token returned HTTP 401 without `error="invalid_token"` and
   always advertised only `portfolio:read`. This omitted the standard refresh
   signal and could narrow a reauthorization attempt back to read permission.

The existing legacy Apps `_meta["mcp/www_authenticate"]` challenge was already
valid. These defects explain possible failure paths, but **the precise cause of
the reported ChatGPT connection's loop is not proven** without observing its
authorization request and a subsequent successful retry. A generic “connection
expired” host message does not establish expiration.

## Fix and security

- Modern requests receive 403 with a complete read+sync challenge. Legacy Apps
  retain the 200 tool-error contract. Both carry the HTTP challenge and Apps hint.
- Presented rejected credentials receive 401 `invalid_token`; absent credentials
  receive discovery without that error. A 401 no longer constrains scopes to read.
- Safe response codes distinguish `token_expired`, `invalid_token`,
  `authorization_revoked`, `forbidden` and `auth_unavailable`. Expired and revoked
  credentials both remain invalid tokens at the OAuth wire level. No credentials
  or provider internals are added to logs.
- No automatic retry, grant expansion, alternative authentication, database
  migration, secret rotation or business-logic change was added.
- Preparation still stores only a 15-minute proposal. Confirmation still requires
  the app-only capability and server authorization; ordinary chat text cannot
  confirm. Ownership, source selection, immutable review and replay protection
  are unchanged. Reconciliation is bookkeeping, not a market trade.

Better Auth issues five-minute access tokens, seven-day rotating refresh tokens
and two-minute authorization codes. Verification enforces signature, trusted
issuer/JWKS, resource audience, client, signed scopes, live session and approval.
Refresh cannot add permissions absent from the original authorization. An
explicit sync grant persists through successive refreshes and is invalid after
signout. Infrastructure failures remain 503, rather than triggering reconnect.

## Validation

All validation uses synthetic fixtures, without portfolio reads or writes in
production:

- `npm run typecheck` — pass.
- `npm run lint` — pass (existing browser-compatibility database age notice).
- `npm test` — 1,067 pass; three opt-in native tests skipped in this command.
- `npm run build` — pass.
- `PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 scripts/test-better-auth-postgres.py`
  — pass: actual provider metadata, explicit consent upgrade, expired access,
  refresh rotation and retained sync, no refresh escalation, signout revocation.
- `python3 scripts/test-screenshot-sync-postgres.py` — pass: real local SQL/RLS,
  isolation across users/sources/grants/sessions, preparation without holdings
  writes, denied direct/model confirmation, expiry, replay and concurrency.
- Route regressions cover both supported challenge contracts, continuing read
  access, repeated authorized preparation without challenge and 401/403/503.

The native runners create and clean disposable loopback PostgreSQL instances.

## Deployment and ChatGPT acceptance

Deploy the server changes to the existing LiveStocks project. No new OAuth client,
callback, secret, permission grant or schema change is required. Confirm discovery
still advertises sync and offline access. If a separate environment has a read-only
client registration, use the documented operator seeder with explicit optional-sync
opt-in; do not broaden existing grants in the database.

Use a designated synthetic account in the existing ChatGPT integration:

1. Refresh tools on the existing App if cached tool scopes omit sync.
2. With read-only consent, call `get_profile` and `get_portfolio_snapshot`.
3. Prepare a screenshot proposal using a synthetic source and holdings. Expect
   one step-up authorization; the consent page must include `portfolio:sync`.
4. After consent, prepare again and verify the review card appears. Repeat and
   verify there is no additional reconnect request. Preparation must not change
   holdings. Plain text approval must not apply the proposal.
5. Wait beyond five minutes and repeat a read and preparation. Verify refresh
   preserves sync without another consent. Only click the review button when
   deliberately testing a synthetic bookkeeping update.
6. Revoke that test connection; verify old access and refresh cannot revive it.

Do not delete/recreate the App or approve a real owner's holdings as a diagnostic.
If the host still loops, record only timestamp, protocol, HTTP status/challenge,
requested scope names and consent outcome; never tokens, cookies, secrets or
personal holdings. A reauthorization request that omits sync after a full sync
challenge indicates host-side step-up/configuration behavior requiring inspection.

## Files changed

- `app/api/mcp/route.ts`: transport challenges and protocol compatibility.
- `lib/auth/auth0-token.ts`: safe expiration classification.
- `lib/auth/server.ts`: safe response codes and revocation classification.
- `__tests__/investment-mcp.test.ts`: challenge/retry/read regressions.
- `__tests__/auth0-token.test.ts`: signed expired versus malformed token.
- `__tests__/auth-server-availability.test.ts`: expired/revoked/unavailable codes.
- `__tests__/better-auth-postgres.test.ts`: real provider and refresh regressions.
- `README.md` and this report: current status and acceptance procedure.
- `verification/oauth-sync-reconnect-2026-11-16.json`: sanitized deployment proof.

## Deployment result

The fix was deployed and promoted to the existing production domain:
`https://razmaz-live-stocks.vercel.app`.

- Deployment: `dpl_4RhhXNxz2pBVA1gszDdLZ1Ken9dd`, READY.
- Original production source: `5c791d0086fdac542b5246ca1ad6712356b41a45`.
- Release commit: `302a43a`, branch `codex/oauth-sync-release` in
  `/private/tmp/livestocks-oauth-sync-release`; only the fix was cherry-picked.
- Working branch: `codex/oauth-sync-step-up-fix`, implementation commit `fe83cc4`.
- No environment variables, OAuth registrations or database state were changed.
- Staged and live probes passed: PRM/AS discovery publishes sync; no credentials
  yield bare 401 discovery; synthetic invalid bearer yields 401 `invalid_token`
  without scope narrowing. No financial data was accessed.
- Post-deployment error-log query succeeded with zero entries in the first
  15-minute query window; this is an immediate smoke check, not long-term monitoring.
- Source commits remain local and are not merged to `main`. A future release
  must include this patch to retain it.
- Live authenticated read/sync, step-up consent and review-card retry in the
  existing ChatGPT connection remain **unverified**. Native provider + SQL tests
  and public live probes do not replace this host acceptance.

## Protocol references

- [OpenAI Apps authentication](https://developers.openai.com/plugins/build/auth)
- [MCP 2026 authorization](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx)
- [RFC 6750 error codes](https://www.rfc-editor.org/rfc/rfc6750#section-3.1)
