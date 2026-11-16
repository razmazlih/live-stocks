# Persisted OAuth resource policy: actual reconnect root cause

## Why the previous fix failed

The prior patch corrected transport challenges and classified token failures. It
was deployed, but it did not inspect or repair the authorization server's persisted
resource policy. Its native tests created a new empty database, so the configured
full resource scope list was inserted correctly and hid an upgrade-only defect.
The actual ChatGPT connection's step-up was not accepted end to end in that task.
The previous report explicitly left that acceptance unverified.

The follow-up verified the live domain serves main commit `b66f00e` in deployment
`dpl_Eq2jKMPNVQcVB8NcmPra9TzPDKRo`. The existing ChatGPT App's management page points
to `https://razmaz-live-stocks.vercel.app/api/mcp`, uses OAuth, and has the sync tools
in its cached tool list. Its installed plugin is still release 1.1.3. The failure
was not an old server deployment, missing tool discovery or a replacement App.

## Actual root cause and evidence

`lib/auth/better-auth.ts:providerOptions` declares full supported scopes in source.
However, Better Auth 1.7.23 seeds `oauthResource` in **insertOnly** mode by default.
Existing resource rows survive redeployment unchanged. Its `resolveResourcePolicy`
intersects requested scopes with the **persisted** `allowedScopes` row and issues
access/refresh tokens using that reduced set. OAuth consent can therefore contain
sync while the issued token does not.

Safe production queries found:

- The registered confidential client permits `portfolio:sync`, requires PKCE and
  consent, and retains its exact callback and authorization-code/refresh grants.
- Two consent records include sync. No raw subjects, credentials or tokens were
  read by these aggregate queries.
- All 118 recorded refresh rows had only the original read/identity/offline
  scopes; none included sync.
- The canonical `oauthResource` row still had only `openid email profile
  offline_access portfolio:read`, last updated 2026-11-15 10:43:57 UTC.
- Public AS/PRM discovery nevertheless advertised sync, because discovery used
  source configuration, not the old resource row.

The old `seedMcpClient(..., {enablePortfolioSync:true})` updated only the client,
not the resource. This was the missing operational step in the previous sync
rollout. Reconnecting could obtain consent again and still receive a read-only
token, repeating the host's generic “connection expired” message.

## Changes implemented

The explicit operator opt-in now validates and repairs both ceilings through the
provider's administrative APIs. It repairs a stale resource even if the client
already permits sync. It changes only `allowedScopes` and `updatedAt`, validates
known old/full scopes and the exact canonical resource, and preserves signing,
TTL, disablement and other security fields. Unknown or disabled policies are
rejected for review. Repeated opt-in is idempotent.

No runtime `resourceSeedMode` overwrite was enabled. User grants, old access
credentials and read-only refresh families are not upgraded. A fresh explicit
sync authorization remains necessary. Tool authorization, 15-minute proposals,
app-private confirmation, RLS, account/source binding and bookkeeping semantics
are unchanged.

## Production configuration repair

On 2026-11-16 at 17:37:44 UTC, the canonical production resource was repaired via
an exact guarded configuration update. It required the observed old scope array
and a SHA256 digest of every other policy field to match before writing.

Exactly **one** resource row changed, adding only `portfolio:sync` and updating
the timestamp. The invariant digest before/after was identical:
`7adba4e734ede50bb1311a92623aa6190d3c91d70ca4a9fbe382f38e9c254768`.
The unrelated localhost resource was untouched. No OAuth client, user consent,
session, token or financial row was changed. The provider does not enable the
optional resource cache, so live issuance reads this repaired row without needing
a process restart. Existing old credentials remain read-only by design.

## Automated integration evidence

The native PostgreSQL/provider test now starts with a preexisting read-only
resource before provider initialization. Before the fix, the sync-token assertion
failed: HTTP 200 token issuance after sync consent yielded `portfolioSync:false`.
The repaired seeder passes that case, including client-already-expanded repair,
idempotence, exact non-scope invariant preservation and refusal of disabled or
unrecognized policies.

The native suite also exercises browser navigation/302 with no forced consent,
explicit read-to-sync escalation, repeat authorization without another consent,
access expiry, rotating refresh retaining sync and signout revocation. Refresh
cannot expand a read grant. A client must preserve `offline_access` when it wants
a refresh token; the resource does not silently add it.

`oauth-sync-gate` exercises the real Next HTTP server, actual provider, JWKS,
PostgREST and PostgreSQL RLS in a newly created disposable environment:

- Working `get_profile` and `get_portfolio_snapshot` with read-only authorization.
- Missing sync: modern HTTP403 and legacy Apps HTTP200 tool challenge.
- Explicit sync consent then three successful preparations of TTWO quantity6,
  USD average cost222, observation/acquisition date2026-11-16.
- Two refresh rotations, repeated preparations without a new challenge.
- Another account's source rejected.
- All financial table hashes for both synthetic accounts unchanged.
- No confirmation tool calls.

The fixture also records strictly allowlisted path, protocol, tool name, status,
requested/issued scope names and challenge classifications for real-host tracing.
It never records headers, query values, tokens, cookies, user IDs or tool arguments.
Privacy regression tests enforce this boundary.

Run:

```sh
PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 scripts/test-better-auth-postgres.py
node scripts/chat-sync-isolated-fixture.mjs oauth-sync-gate --state-file PRIVATE_DISPOSABLE_STATE
```

The HTTP chain used app source `f890b54`, whose runtime OAuth/MCP code matches the
live deployment. The later code fix affects explicit operator setup rather than
request-time authorization. Production financial data was not accessed for these
tests. The disposable fixture's exact TTWO input uses its authenticated synthetic
user's active source UUID; no real source IDs or tokens are copied.

## ChatGPT acceptance and remaining action

Actual-host acceptance is being recorded separately below. A valid initial read
connection can legitimately show one generic Reconnect prompt to request sync;
its text alone does not imply expiry. After the resource repair, reauthorization
must request sync and the issued token must retain it. A read-only refresh cannot
add sync, so an existing affected connection may need one fresh authorization.

Do not replace/delete the existing production App, automatically broaden a user
grant, change secrets/callbacks, or approve real holdings as a diagnostic.
