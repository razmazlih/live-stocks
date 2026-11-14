# Accounts, ownership and production cutover

Auth0 supplies website and plugin identities. Supabase stores the portfolio and enforces ownership. Auth0 subjects are opaque strings; this implementation does not use `auth.uid()`, UUID conversion, Supabase Auth accounts, or an application-issued identity bridge.

## Current verification status

As of 2026-11-14, **production has not been migrated or verified with the new account flow**. The Auth0 tenant is configured, CLI access and the two intended login connections were approved by the user, and a real login ID-token signature check passed after configuring RS256. The website session/API flow passed a complete local synthetic end-to-end check; a real ChatGPT-host authorization flow and physical iPhone behavior remain unverified at this checkpoint. Recheck current setup evidence before provider operations or cutover.

The [hosted Supabase gate](verification/auth0-hosted-gate-2026-11-14.json) passed **22 authorization/isolation cases and 4 cleanup cases** on the dedicated test project. Real Auth0 access tokens for two website users and MCP user A were accepted by the hosted gateway. A uniquely named synthetic fixture table proved owner isolation, website writes, MCP read-only enforcement, anonymous/tampered-token denial, connection revocation and rejection of the old MCP JWT after re-enabling access. The fixture table and its isolated schema were removed and their absence verified. Existing financial table names were inspected only as metadata; their rows were neither read nor modified. This closes the hosted gateway/isolated RLS compatibility question, **not** the full hosted financial-schema migration, legacy-owner backfill or application end-to-end gate. The user authorized a temporary cleaner pause to free capacity for this test; the test project was paused again and cleaner was verified ACTIVE_HEALTHY with a successful read-only database response after restoration.

The [actual Auth0 OAuth gate report](verification/auth0-oauth-gate-2026-11-14.json) records **14 PASS / 1 FAIL**, with the overall status preserved as **FAIL**. Positive website/MCP issuance, two-account separation, wrong-PKCE rejection, refresh behavior and grant revocation passed. `exchange_wrong_resource` failed: Auth0 issued a token despite a contradictory token-exchange resource, and the canonical application verifier accepted that token. This is not a passed strict resource-binding gate. The published report contains statuses and booleans, not credentials or JWTs.

On 2026-11-14 the user explicitly accepted continuing with strict verification of signed JWTs for the configured canonical issuer, client, audience and permissions despite that specific provider limitation. This acceptance applies only to `exchange_wrong_resource`; it does not waive account isolation, JWT validation, hosted integration checks, backup/restore verification, real ChatGPT compatibility, or production cutover requirements. The raw failing result must not be relabeled as PASS. The provider gate used synthetic database accounts; it does not prove the selected legacy-owner login or hosted database authorization.

Website validation passed: **611 Vitest tests across 59 files**, `npm run lint`, `npm run typecheck`, and a full `npm run build`. Isolated browser checks verified protected-page redirects to sign-in, the unconfigured session response, anonymous widget rejection, Hebrew RTL/English LTR, and desktop/390px mobile layouts with no horizontal overflow or browser console errors. The [desktop](screenshots/account-sign-in-desktop.png) and [mobile](screenshots/account-sign-in-mobile.png) screenshots contain no portfolio data or credentials. Scriptable mocks passed 10 credential/cache security scenarios and 222 display assertions across 36 renders; they do not verify native iPhone behavior.

Local checks passed against disposable PostgreSQL databases: fresh migrations, populated-data backfill, rollback on missing owner/encrypted credential, both SQL regression suites, ownership/RPC isolation, MCP revocation and widget lifecycle. The preparation script also passed an end-to-end test using synthetic data, local TLS PostgreSQL and local HTTPS JWKS. These tests are not a backup or restore test of production data.

## Identity and token contract

The dedicated Google OAuth client was created in the user-created `livestocks-auth` Google Cloud project after explicit approval. The existing Auth0 Google connection now uses that client with only `email` and `profile` scopes; its Domain Connection status and other connection settings were preserved. Credentials are stored outside Git in protected local secret storage and in Auth0. Google remains in Testing with the approved owner account listed as a test user; Auth0 Try Connection completed a real Google sign-in and a read-only identity check confirmed verified email. Google public availability and a signed Google-user token for the LiveStocks clients have not yet been verified; see [the scoped connection report](verification/google-connection-2026-11-14.json). Google and email/password identities must not be merged by email.

The website uses the Auth0 Next.js SDK with an encrypted session cookie. Next.js proxy protects page entry; each API verifies the actual session/token independently. The browser Supabase client obtains its temporary database credential from `/api/account/database-token`, keeps it only in memory, and is recreated when the account changes. Outstanding requests and private React state are cleared on sign-out or revalidation. This is not a Supabase Auth/SSR session implementation. Signup, login and password recovery use Auth0 Universal Login. Callback failures map to a fixed localized sign-in message without echoing provider errors; return destinations must be relative paths on the application origin.

The sign-in language selector sends `ui_locales=he` or `en` through the Auth0 SDK for login and signup; direct login defaults to Hebrew. The tenant's enabled locales were verified as `["en", "he"]`, preserving its previous English fallback. Tests exercise both languages through the installed SDK's real middleware. A read-only provider snapshot confirmed Hebrew login text and locale-preserving signup/recovery links. The recovery screen, localized email delivery and upstream Google consent language have not been verified.

Website and MCP clients must be distinct. Their API audiences are the canonical HTTPS origin followed by `/api/web` and `/api/mcp`, respectively. Both use Auth0-signed **access tokens**. The server verifies RS256/ES256 against the configured issuer's JWKS; it does not trust token-provided key URLs.

| Claim | Website | MCP |
| --- | --- | --- |
| `iss` | Exact configured Auth0 issuer, including trailing slash | Same issuer |
| `sub` | Nonempty opaque subject, at most 255 characters | Same identity format |
| `azp` | Exact website client ID | Exact approved MCP client ID |
| `aud` | Contains the canonical `/api/web` audience | Contains the canonical `/api/mcp` audience |
| `scope` | `portfolio:read portfolio:write` | `portfolio:read`; server rejects `portfolio:write` |
| `role` | Literal string `authenticated` | Literal string `authenticated` |
| `https://livestocks.app/read_only` | Boolean `false` | Boolean `true` |
| `https://livestocks.app/email_verified` | Boolean `true` | Boolean `true` |
| `iat`, `exp` | Valid integer issuance/expiry times | Same, plus live connection cutoff |

An audience can be a string or an array of strings. If `client_id` is also present, the server requires it to agree with `azp`. Wrong clients, audiences, issuers, flags, scopes or unverified email fail closed. Invalid bearer credentials do not fall back to a different cookie session.

The [Post Login Action](../plugins/livestocks/auth0/post-login-action.js) adds the authorization claims and removes MCP write scope. Its secret name for the website client is `AUTH0_WEBSITE_CLIENT_ID`; the application environment uses `AUTH0_CLIENT_ID`. Configure the two matching values deliberately.

**Live token compatibility:** the hosted fixture gate verified that real website/MCP access tokens retained literal `role: authenticated` and were accepted as authenticated identities by Supabase. Preserve this contract when changing provider configuration. Provider documentation differs about non-namespaced access-token claims; the implemented code requires the literal role and grants no anonymous fallback. If a later configuration strips it or the integration rejects the token, stop before migration and resolve the provider contract. Local signatures, ID-token success, or mocked claims alone do not satisfy hosted compatibility. See [Supabase's Auth0 integration](https://supabase.com/docs/guides/auth/third-party/auth0) and [Auth0's custom-claims restrictions](https://auth0.com/docs/troubleshoot/product-lifecycle/past-migrations/custom-claims-migration).

Google login and password login can produce different Auth0 subjects even for the same verified email. **Do not merge ownership by email.** The legacy owner explicitly selects the exact verified `sub`; neither first signup nor email matching claims existing data. Any later identity linking or ownership transfer requires its own deliberate migration.

The owner completed verified sign-in and explicit identity confirmation on 2026-11-14. The protected owner record is separate from the portfolio; confirmation did not migrate data. Owner capture requires the website client's ID-token signing algorithm to be RS256. Its callback uses a neutral Continue page before the Strict-cookie confirmation. Preserve `Referrer-Policy: same-origin`: `no-referrer` can produce `Origin: null` on browser form submission, which the exact Origin check rejects. The isolated Chromium regression (`node scripts/test-owner-capture.mjs --help`) passed 16 browser/security checks, including wrong Origin, CSRF, injected ownership and missing-cookie denial.

## Database ownership and private access

The [Auth0 migration](../supabase/migrations/20261114114916_auth0_user_isolation.sql) gives all six existing tables a text `user_id` referencing `public.user_profiles(id)` with restrictive profile deletion:

| Table | Additional isolation |
| --- | --- |
| `positions` | Unique owner + normalized symbol + brokerage location |
| `position_lots` | Composite position/owner FK |
| `position_plans` | Own owner even when `position_id` is null; composite FK when linked |
| `settings` | One row per owner |
| `watchlist_groups` | Owned group |
| `watchlist_tickers` | Composite group/owner FK |

Ownership is immutable through ordinary updates. Existing permissive policies are removed. Only authenticated clients receive table access; RLS repeats trusted issuer/client/audience/capability checks. A missing `private.auth_config` row denies all access. Website profile creation is restricted to its own verified subject. The purchase RPC remains transactional and retry-safe, scoped to its owner.

Private tables contain trusted configuration, MCP connection state, encrypted Finnhub credentials and hashed widget tokens. They are not exposed as a REST schema. Explicit public `server_*` RPCs are executable only by `service_role`; the server never uses the service key as a general substitute for user authorization. The widget summary is a limited exception: its hashed credential resolves an owner, and its fixed server queries explicitly filter that owner.

Disconnect first disables the MCP connection in the database, then revokes provider grants. Provider errors leave it disabled. Reconnect is an explicit website action and advances the cutoff; an MCP JWT must have `iat > valid_after`. Automatic bootstrap never reenables a disabled connection. Widget credentials are independently revocable, expire after 90 days, and store only a SHA-256 hash. The widget summary returns its expiry for offline-display limits.

## Environment and secret handling

| Configuration | Purpose |
| --- | --- |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_MCP_CLIENT_ID` | Trusted issuer and distinct clients |
| `APP_BASE_URL`, `AUTH0_WEB_AUDIENCE`, `AUTH0_MCP_AUDIENCE` | Canonical HTTPS origin and API audiences |
| `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | Website OAuth client secret and session encryption |
| `AUTH0_MANAGEMENT_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_SECRET` | Server-only grant revocation, with `read:grants delete:grants` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project address and public/publishable-compatible API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only private RPC/profile/widget administration |
| `CREDENTIAL_ENCRYPTION_KEY` | Server-only 32-byte AES key encoded as 64 hexadecimal characters |

Keep secrets out of browser bundles, logs, screenshots, git and cloud-synced backup folders. The credential encryption key also protects preparation archives; retain it independently of those archives. Replacing it without reencrypting existing envelopes prevents their decryption.

Finnhub credentials use AES-256-GCM with a fresh 12-byte IV and AAD `livestocks:finnhub:v1:<exact-sub>`. The envelope is `v1.<iv-base64url>.<tag-base64url>.<ciphertext-base64url>`. The migration removes the plaintext `settings.finnhub_token` column only after the administrator supplies its encrypted replacement.

## Reproduce the local checks

From the repository root, with native `initdb`, `pg_ctl` and `psql` on `PATH`:

```sh
npm test
npm run typecheck
npm run lint
npm run build
node output/widget/widget-auth-test.cjs
node output/widget/widget-v7-test.cjs
python3 scripts/test-tenancy.py
npx vitest run __tests__/auth0-token.test.ts
```

The Python runner creates fresh loopback-only PostgreSQL clusters on fresh ports, ignores inherited database connection settings, uses synthetic data and cleans up its own cluster. It never accepts a production URL or loads `.env`. It runs both [multi-user isolation](../supabase/tests/multi_user_isolation.sql) and the original [position identity regression](../supabase/tests/position_identity.sql), now with synthetic Auth0 claims.

The complete local website path also passed **13 checks** using real Auth0 browser logins for two existing synthetic accounts: Next SDK session cookies, the cookie-backed database-token endpoint, the real browser Supabase client, native PostgREST and all six tables' RLS. Checks cover empty/default account bootstrap, owner writes and cross-owner mutation denial, private JSON/HTML snapshots, anonymous denial, and an in-flight request aborted during an account switch with old caches cleared. This uses an isolated production build with no `.env` files, fresh private Chromium contexts and a fresh local database; it never reads the owner's portfolio. The [sanitized evidence](verification/account-local-e2e-2026-11-14.json) records `PASS_LOCAL_NEXT_AUTH0_RLS` and complete cleanup. It is not hosted gateway, production deployment, Google or ChatGPT compatibility proof.

```sh
node scripts/test-account-e2e.mjs --help
ACCOUNT_E2E_PLAYWRIGHT="/absolute/path/to/installed/playwright/index.mjs" \
node scripts/test-account-e2e.mjs --input "$PRIVATE_SYNTHETIC_ACCOUNT_INPUT"
```

The protected input file must be outside the repository, owned by the current user and mode `0600`; it contains the explicit Auth0 application configuration and exactly two authorized synthetic `@example.invalid` users. The runner never creates users or edits the tenant. It requires free localhost port `3109`, native PostgreSQL tools and macOS ARM64 for the checksum-pinned PostgREST binary. Its test-only API adapter and temporary browser harness exist solely in the disposable copy. No bearer tokens, passwords or financial rows are written to the report.

The earlier Supabase Auth/GoTrue diagnostic remains reproducible separately:

```sh
node scripts/oauth-gate/run-local.mjs
GATE_KEEP_RUNTIME=1 node scripts/oauth-gate/run-local.mjs
```

This uses a disposable native GoTrue runtime, not Auth0. Its recorded local report is `FAIL` for resource-binding cases. Even `PASS_LOCAL` would not prove hosted JWT/JWKS integration, RLS, or real ChatGPT authorization. `GATE_KEEP_RUNTIME=1` retains diagnostic files for an incomplete run; they contain synthetic credentials and must stay local. On platforms without the supported downloaded binary, `GATE_AUTH_BINARY` must identify a separately verified compatible native executable.

## Prepare a backup and owner parameters

The production source was observed on PostgreSQL 17. Verify its version again; use `pg_dump` at least that major and `pg_restore` at least the dump utility's major. Local libpq 18.7 is available at `/opt/homebrew/opt/libpq/bin`; put that directory first on `PATH` for preparation. PostgreSQL 14 dump utilities are insufficient for this source.

Supply the application configuration above and these explicit preparation-only environment variables through a secure local process environment:

- `MIGRATION_DATABASE_URL`: the intended PostgreSQL source. TLS defaults to `verify-full`; any explicitly weaker `sslmode` is rejected. No inherited libpq connection fallback is used.
- `MIGRATION_SSL_ROOT_CERT`: an absolute path to the trusted database CA downloaded from the project's Database Settings → SSL Configuration. The script requires a current PEM CA file owned by the current user or root, rejects symlinks and group/world-writable files, and passes it explicitly as `PGSSLROOTCERT`.
- `LEGACY_OWNER_ACCESS_TOKEN`: a current, signed, verified website access token for the selected owner.
- `MIGRATION_BACKUP_DIRECTORY`: an existing absolute private local directory outside the repository, any Git checkout and cloud-synced folders. Desktop/Documents paths are rejected because they can be synced.
- `CREDENTIAL_ENCRYPTION_KEY`: the same protected key intended for the deployed application.

The script does **not** load `.env` files. After setting the non-secret `LEGACY_OWNER_SUB` variable to the exact intended subject, run:

```sh
node scripts/prepare-account-migration.mjs --help
node scripts/prepare-account-migration.mjs --owner-sub "$LEGACY_OWNER_SUB"
```

The TLS-only production preflight on 2026-11-14 completed `BEGIN READ ONLY; SELECT 1; ROLLBACK` with libpq 18.7 and the official Supabase CA. System trust alone returned `SSL error: certificate verify failed`. The [official dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json) supplies the [production CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt); the checked certificate's SHA-256 fingerprint was `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`, valid through 2031-04-26. This proves verified TLS and the existing database credential, not owner selection, a backup or a migration. Recheck the current project certificate before use; never work around trust errors by disabling validation.

The owner flag must exactly match the verified token subject. No token or password belongs on the command line. The script performs read-only database work: an exported repeatable-read snapshot supplies both the six-table counts/digests and `pg_dump`. UTC is explicit for canonical timestamp hashing. Its archive covers `public`, `private` and `supabase_migrations` where present. It streams the dump directly into AES-GCM ciphertext, with a separate backup AAD, and creates a private directory with mode `0700` and files with mode `0600`:

- An encrypted PostgreSQL custom archive; no plaintext dump file.
- `manifest.json`, containing source version, snapshot-consistent counts/digests, cipher metadata, ciphertext SHA-256 and key fingerprint.
- `migration-parameters.sql`, containing protected session GUCs and the encrypted legacy credential, without applying the migration.

The archive is authenticated and parsed by generating SQL into `/dev/null`, without a target database. **This is not a restore test.** A successful manifest says `PREPARED_RESTORE_TEST_REQUIRED` and `restoreTested: false`.

Preparation counts are a baseline for those six tables at that snapshot, not a guarantee of current production state. Historical inspection counts are not cutover assertions. Users can change data after preparation; freeze writes and refresh the counts/digests before the actual cutover. Never print raw portfolio rows or plaintext credentials to compare them.

## Restore rehearsal and production cutover

After explicit owner confirmation on 2026-11-14, the actual source backup completed and was restored into a disposable PostgreSQL 17.12 cluster using `pg_restore` 18.7. All six original row counts/digests matched: positions **17**, position lots **55**, position plans **0**, settings **1**, watchlist groups **1**, watchlist tickers **4**. The credential hash also matched without displaying its value. These are snapshot counts, not a statement of current production contents.

The reviewed ownership migration then passed on that restored copy. Every financial row, ID and timestamp matched its expected canonical digest after the ownership/credential-column transformation; all rows belonged to the explicitly confirmed subject; the encrypted credential decrypted to the original value. A deliberately injected error immediately before the migration's final commit reached its unique expected marker and rolled back all schema/data changes. A separate successful run then verified the actual commit. The disposable cluster was removed. No production migration or other hosted write occurred.

The encrypted archive and original preparation manifest remain unchanged under `~/.codex/backups/livestocks/livestocks-account-migration-vtG1TK/`. Its separate protected `restore-report.json` records `PASS`, `restoreTested: true`, migration/rollback checks and `cleanup: COMPLETE`. The preparation manifest correctly retains its original `restoreTested: false`; the later report supplies the actual evidence. No credential values or credential hashes are included in this documentation.

Reproduce this verification with the independently protected key already in the environment and `BACKUP_DIRECTORY` pointing at a private prepared artifact:

```sh
PATH="/opt/homebrew/opt/libpq/bin:$PATH" \
RESTORE_POSTGRES_BIN=/opt/homebrew/opt/postgresql@17/bin \
node scripts/restore-account-backup.mjs --backup-directory "$BACKUP_DIRECTORY" --rehearse-migration
```

This separate restore script accepts no database URL, never reuses an existing database, and does not load `.env`. It authenticates the encrypted archive before executing any SQL, creates its own password-protected loopback PostgreSQL cluster with private storage, verifies the source digests in UTC, optionally rehearses the reviewed migration, writes a protected report and removes the cluster. It does not apply a production migration. Failure diagnostics, if needed, remain only in the protected backup directory.

1. Verify the encrypted artifact's SHA-256 and identify the independently retained encryption key. Read its IV, GCM tag and AAD from the protected manifest.
2. Use the separate restore verifier above, or prepare a disposable, explicitly local PostgreSQL database with compatible version, roles and required extensions. Authenticate/decrypt the archive through a stream into its restore process; do not write a plaintext dump or point the restore at production. The preparation script itself never restores.
3. Verify all six restored row counts and original canonical row digests against the manifest, including original timestamps and relationships. Rehearse the ownership migration on that clone and verify its preserved financial digests and encrypted credential transfer. Record the actual restore evidence separately; do not relabel an untested archive as restored.
4. Complete the real provider gate: separate website and MCP authorizations, verified literal database role, direct REST ownership isolation for two users, MCP write denial, wrong-client/audience rejection, disconnect/reconnect cutoff, and real ChatGPT authorization. Include widget expiry/revocation and the intended mobile flows.
5. Before serving private accounts, close access to old unauthenticated deployment URLs and aliases, including old AI/MCP endpoints. Invalidate their shared portfolio caches. RLS alone cannot stop an older deployment from serving a previously cached public snapshot.
6. Freeze writes, take/verify the final backup and refreshed source baselines, and reverify the exact owner subject. Review the selected migration, environment and irreversible credential-column removal before running the production cutover.
7. Supply `migration-parameters.sql` and the reviewed migration on the **same database connection**. Its GUCs use session scope. The migration has its own explicit `BEGIN`/`COMMIT`; do not assume an outer transaction can undo work after that `COMMIT`, and do not use separate connections for parameters and migration. Use a reviewed process that also records/reconciles Supabase migration history; bare SQL-file execution alone does not maintain that history.
8. Confirm that original row IDs, values, timestamps and parent links survived; every legacy row belongs to the chosen subject; the encrypted Finnhub credential decrypts correctly without being displayed; other users see empty independent portfolios. Enable normal access only after the final authenticated checks pass.

The migration aborts a populated database without `app.legacy_owner_subject`; an existing plaintext Finnhub credential additionally requires `app.legacy_finnhub_encrypted`. The five optional configuration GUCs are `app.auth0_issuer`, `app.auth0_website_client_id`, `app.auth0_mcp_client_id`, `app.auth0_website_audience` and `app.auth0_mcp_audience`; provide all five together. Omitting all five leaves authorization disabled. Empty databases need no legacy owner.

Before commit, errors roll back the migration transaction. After commit, keep ownership/RLS in place and prefer a forward fix. **Never roll back privacy by restoring anonymous policies or an unauthenticated application build.** If database restoration becomes necessary, freeze writes and reconcile activity after the backup; a blind restore would lose new users' changes. Do not attempt to recreate a global singleton portfolio after multiple users have begun writing.
