# Better Auth hosted integration gate

Infrastructure inspection and bounded synthetic gates on 2026-11-15. The isolated gates did not change production. Separately, the parent operator provisioned only the final private authentication store and staged an unpromoted maintenance deployment; production financial rows, schemas, policies and ownership remain unchanged. See [auth-store-only execution evidence](verification/production-auth-store-only-2026-11-15.json). No production issuer trust or financial migration is implied, and billing was not changed.

## Confirmed infrastructure

| Resource | Observed state |
| --- | --- |
| Supabase production `osvwctooasdxsztatirz` | ACTIVE_HEALTHY, PostgreSQL 17.6 |
| Supabase test `qdcvlhghabchxstoedzq` | INACTIVE |
| Supabase cleaner `fkhwimpzfhofxnbckfuf` | ACTIVE_HEALTHY |
| Supabase organization | Free; two active projects already in use |
| Production authentication schema/role | Present: 13 private auth tables, restricted `livestocks_auth_backend`, private adoption marker; no financial access |
| Administrative database capability | `postgres` has CREATEROLE; read-only catalog check only |
| Vercel project | `prj_rq3UoLiTcbg3yl28LGDsxNiVbvgb`, team `team_Vwue1DdSHaQvCACjh6T8CWVq`, Node 22.x |
| Latest preview | READY, `live-stocks-afkxnd0nz-razs-projects-0212f70e.vercel.app`, commit `16389fe` |
| Staged production candidate | READY, unpromoted `dpl_5KyKu1U18ECq71aANTNwW7rsXCbi`; fixed discovery/JWKS and maintenance blockade verified with authenticated CLI |
| Live canonical alias | Still `dpl_5yLNtaDX426Cp9Qz5rVeJqjPujvK`; original site has not been replaced |
| Deployment protection | Vercel SSO `all_except_custom_domains` |

Two active free projects is the quota across the owner's eligible organizations; a second free organization is not an extra pair of slots. A paused project does not consume a slot. See [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

There is no spare isolated, no-cost **hosted Supabase** slot without temporarily pausing an active project. The user explicitly approved a new bounded cleaner pause/test/restore window on 2026-11-15. That window encountered existing TEST financial rows and stopped before migrations; it does not authorize deleting or rewriting them. Any subsequent pause requires a newly coordinated window. A paid environment would require an exact quote and approval. Pausing LiveStocks production is disruptive and is not the recommended test approach. Local or externally self-hosted PostgreSQL tests can continue, but cannot prove the managed Supabase authentication gateway. A test schema on the production project also shares its issuer trust and infrastructure; it is not the promised isolated gate.

## Bounded gate result on 2026-11-15

**INCOMPLETE: existing TEST data blocked the safe schema preflight.** The runner restored TEST, counted existing financial rows without reading their values, and stopped before applying any migration, issuer integration, backend credential or synthetic account. The existing tables were not reset or modified. The run started at 09:43:26 UTC and finished cleanup at 09:53:47 UTC: TEST was INACTIVE, cleaner was ACTIVE_HEALTHY and its `SELECT 1` health check passed. The isolated Vercel environment values were removed. See [sanitized evidence](verification/better-auth-hosted-preflight-2026-11-15.json). Yesterday's Auth0 gate also deliberately preserved these existing tables and used a separate fixture; they must not be assumed disposable.

A separate public synthetic Vercel project, `livestocks-auth-gate` (`prj_cEKIsmvexYVOaiUTgp1hbOWGE6Zz`), was created at `https://livestocks-auth-gate.vercel.app`. Its anonymous health response was verified and it contains no production database or SMTP credentials. Production project protection remains unchanged. This does **not** prove hosted Better Auth discovery, tokens or RLS: the configured-provider deployment was not reached.

The reproducible preparation is `node scripts/prepare-better-auth-hosted.mjs`. It creates a protected temporary service from the actual auth implementation. The gate command is `node scripts/test-better-auth-hosted.mjs --service-directory <prepared-private-directory> --allow-cleaner-pause`; the flag is a mechanical safeguard, not approval. The revised fixture-only script rejects unexpected project states, any reserved namespace collision and changed source hashes, and restores project states in `finally`. It records existing financial row counts and public table names before and after without modifying those tables. Reports and credentials remain outside the repository. No automatic retry or data reset is permitted.

A subsequent isolated fixture gate can establish hosted issuer/JWKS acceptance without migrating existing portfolios, with its limits recorded alongside the complete native PostgreSQL migration/RLS gate. Full hosted financial-schema migration needs a clean authorized dataset or an explicit backup/reuse decision.

## Revised non-destructive fixture sequence

`python3 scripts/test-better-auth-hosted-fixture.py` first runs the fixture against disposable native PostgreSQL. It exercises actual provider login/consent/PKCE/refresh, live-session and approval predicates, and preservation of pre-existing sentinel tables through cleanup. This local gate passed; it is not managed-gateway proof.

1. Prepare the actual auth service and verify its frozen source manifest. Before any new pause, review the fixture diff and confirm a coordinated window. Restore only TEST and wait for ACTIVE_HEALTHY.
2. Inspect catalog collisions and count existing financial rows; do not read their values or require an empty portfolio. The fixture transaction requires `private`, `livestocks_auth`, `livestocks_auth_backend`, its one public fixture table and its identity-resolver function to be absent. Collision means stop, not overwrite.
3. Create only the exact generated provider schema, minimal profile/identity/config/approval dependencies, and `public.livestocks_ba_gate_20261115`. The authorization, session and approval function bodies are extracted from the committed migrations with only `public.user_profiles` changed to the new private fixture profile table. Financial migrations, ALTERs and backfill never run here. Grant the dedicated backend role only its actual auth rights. Use a unique test password and full certificate/hostname verification over the session pooler. Pass the reviewed public Supabase CA path using `BETTER_AUTH_GATE_CA_FILE`; the certificate is validated before any pause and its SHA-256 is recorded. Never turn TLS verification off. [Supabase custom-role connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
4. Deploy the actual provider to the separate synthetic origin. Verify anonymous HTTPS discovery and persisted asymmetric JWKS; add only this issuer to TEST's Custom OIDC integrations. Production Vercel protection remains unchanged. [Supabase Custom OIDC requirements](https://supabase.com/docs/guides/auth/third-party/custom-oidc).
5. Insert two synthetic verified provider users with generated password hashes; call real password login and code/PKCE/consent/token endpoints. The isolated test deployment explicitly opts in `PASSWORD_AUTH_ENABLED=true` for this synthetic protocol gate; the production Google-only default remains off. No SMTP or real Google claim follows from admin-created synthetic users.
6. Send actual signed website/MCP JWTs through the hosted Data API to the single synthetic fixture. Verify owner-only reads/writes, cross-owner denials, MCP read-only access, anonymous denial, wrong issuer/audience/client/role/session/signature, stable refresh evidence, and denial of existing JWTs plus refresh after approval revocation and sign-out. Private auth tables remain unexposed. Record this as **hosted provider and isolated fixture RLS**, never full hosted financial migration.
7. In `finally`, remove only the created issuer integration, fixture table, helper function, new private/auth schemas and new role; verify original public table names and financial counts match. Pause TEST, restore cleaner, run `SELECT 1`, and remove isolated Vercel environment secrets. Each fixture has a random ownership marker, checked again during cleanup even if its creation request timed out. Cleanup refuses any mismatched marker. The active gate has a 20-minute deadline; allow a conservative 40-minute coordinated window for pause/restore and bounded cleanup, and do not abandon a delayed restore. Cleanup failure stays visible and must be resolved before completion.

The native full-bundle migration/RLS and backup-restore gates remain separate evidence. No test database reset, production trust change or production financial migration is part of this fixture procedure.

Production cutover remains a separate step requiring the full final backup/restore rehearsal, proved new-owner mapping, coordinated maintenance, data parity checks and the existing App OAuth transition. Hosted local-token success does not authorize production migration by itself.

## Existing ChatGPT App

Read-only source inspection and the actual ChatGPT settings screen agree:

- App: `asdk_app_6af6d6f889a88191ae50abfc0070421b`.
- Plugin: `plugin_asdk_app_6af6d6f889a88191ae50abfc0070421b`, private USER release 1.1.0.
- App version: `asdk_app_v_6af6d6f889b881918e34cce7bb732ffd`.
- MCP URL: `https://razmaz-live-stocks.vercel.app/api/mcp`.
- Authorization supported: None. Authorization used: None.
- The page offers Refresh tools, name/description edits, publishing and deletion; no callback or OAuth client editor is currently visible. No such action was invoked.

[OpenAI documents refreshing an existing connection after authentication changes](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata). This supports preserving the current App IDs; it is not evidence that this particular connection already switched. After the server change, refresh and observe the exact management flow. [Authentication documentation](https://developers.openai.com/plugins/build/auth) requires copying the exact callback shown there; stable and callback-ID-specific redirects both exist. Do not guess or register wildcards.

The package is App-backed: its `.app.json` is an identity binding, not an OAuth configuration. Plugin Creator supports skill updates while preserving the App-owned connection. Do not add a second MCP declaration, delete/recreate the App, or alter its brand as a workaround. Local candidate 1.2.0 remains unpublished until actual login, account switching, canonical profile stability, refresh and disconnect work inside ChatGPT.
