# Personal-account production cutover

**Production financial migration remains blocked.** All four migrations, strict adoption of a pre-created authentication store, and rollback now pass a disposable local rehearsal against the actual encrypted backup. `CUTOVER_READY` remains `false`; `--prepare` refuses production migration SQL generation, and there is no `--apply` mode. Older migration packages must never be applied.

Target project: `osvwctooasdxsztatirz`. The previously confirmed Auth0 subject remains the canonical portfolio ID. A separately proved Google login in the final Better Auth store gets an explicit alias to that profile. Email matching and signup order never assign legacy data.

Auth-store-only preparation was executed on 2026-11-15: the reviewed 13-table schema, restricted backend role and private provenance marker now exist in the final project. All six financial table row digests stayed identical; financial schemas, policies and ownership were not changed. A protected, unpromoted maintenance deployment passed fixed canonical discovery, public asymmetric JWKS and a 503 portfolio blockade. The live alias is unchanged. See [sanitized execution evidence](verification/production-auth-store-only-2026-11-15.json). This is not a completed owner confirmation, hosted isolation gate, financial migration or live release.

## Reviewed source bundle

| Migration | SHA-256 |
| --- | --- |
| `20261114114916_auth0_user_isolation.sql` | `92f2a3c6bd5255029232576c2c147ced84dbc0fa3c527c6c4df6703e5f32dffc` |
| `20261114145729_canonical_profiles_and_lossless_merge.sql` | `057446814d430582fefea215129d27b28efa88531c2b0648f86723bf0837c501` |
| `20261114151506_better_auth_private_sessions.sql` | `bec5796f998d5ba541ce6333319bb0b2544975bc3eb66115d652b8487cf6935e` |
| `20261115094000_sign_in_method_operations.sql` | `9242a3e784b92146b3ac737d6bfe2ecbf707bcb52cba6d7fbbdc4669f4c14a11` |

Bundle fingerprint: `312efd7dc697e86fcd8d6be06e83138121beb4552ae30c8a39db7257c3575b2f`. The generator checks exact file contents and ordering. Restore proof also records the generator, restore-tool and owner-store-tool hashes; changing those requires a new proof. The original migrations are unchanged.

## What was actually verified

[Sanitized evidence](verification/full-bundle-restore-2026-11-15.json) records the result. The protected detailed report accompanies the existing encrypted backup in `~/.codex/backups/livestocks/livestocks-account-migration-vtG1TK/restore-report.json`. The original archive, manifest and parameter file remain unchanged.

The rehearsal authenticated and restored the encrypted archive into a fresh SCRAM-protected PostgreSQL 17 cluster, listening only on loopback. It proved:

- Auth-store preprovision leaves all six financial tables unchanged. Exact schema, ACL and provenance-marker adoption succeeds; altered structure, ACLs, marker, confirmation receipt and missing live session fail closed.
- A committed legacy table/column/RPC freeze and termination of an existing synthetic `authenticator` connection. A stale backup, changed row counts and changed digests with unchanged counts are rejected.
- All four migration bodies, provider configuration, explicit owner alias and four history records commit in **one** transaction. Only the exact, hash-pinned auth DDL prefix is omitted after strict adoption checks.
- An injected error before commit rolls back new financial/identity schema, merge role and all history entries, while preserving original financial hashes, the preprovisioned auth store and the previously committed access freeze.
- Successful migration preserves six-table IDs, financial values and timestamps. Comparison excludes only added ownership/consolidation/active metadata. The old settings token is verified separately after authenticated decryption of its encrypted replacement.
- All 13 authentication tables, including user/account/session/JWKS/confirmation rows, remain unchanged. A second encrypted archive containing all four schemas was restored separately and passed the same adoption and migration checks.
- The original canonical owner remains pinned; a synthetic, explicitly proved Google identity can read that portfolio through the alias and live-session RLS. Anonymous access stays denied; service-role financial access is SELECT-only. Both temporary clusters and the nested archive were removed.

This proves local mechanics, **not control of the real Google owner or hosted acceptance**. The baseline has 17 positions, 55 lots, 0 plans, 1 settings row, 1 watchlist group and 4 tickers. These are backup counts, not current production counts. A fresh post-freeze backup is mandatory.

To repeat the proof, load secrets into a protected child environment without printing them, use compatible `pg_restore` (18.7 used here), and run:

```sh
RESTORE_POSTGRES_BIN=/opt/homebrew/opt/postgresql@17/bin \
node scripts/restore-account-backup.mjs \
  --backup-directory "$VERIFIED_BACKUP_DIRECTORY" \
  --rehearse-cutover
```

`CREDENTIAL_ENCRYPTION_KEY` is required. An archive containing the final auth store also requires its `BETTER_AUTH_SECRET` to verify the receipt. Set `RESTORE_FINAL_STORE_PROBE=1` on the original pre-auth archive to repeat the additional encrypted final-store roundtrip with a synthetic owner. Add `RESTORE_MANAGED_ROLE_PROBE=1` to model the observed managed PostgreSQL admin edge: `livestocks_auth_backend` granted to `postgres` with admin option. The latest local proof includes that shape. Restoration reconstructs only this exact marker-recorded edge (or none), checks the original catalog fingerprint and safe role attributes, and rejects reversed, malformed, duplicate or other memberships. It never grants another role to the backend. No `.env` is loaded. `--rehearse-migration` runs the same guarded proof. Neither mode accepts a hosted database URL; synthetic binding and local ACL reconstruction have independent SQL loopback guards.

## Preprovision the final login store

This is a separate, reviewable **auth-only** operation before financial cutover. Prepare its protected SQL with:

```sh
node scripts/prepare-owner-store.mjs \
  --project osvwctooasdxsztatirz \
  --env-file "$PRIVATE_BETTER_AUTH_ENV_FILE" \
  --output-directory "$PRIVATE_REVIEW_DIRECTORY"
```

The CLI never connects or executes SQL. It validates the exact final-project backend URL and writes `00-preprovision-owner-store.sql` plus a preparation hash manifest. Inputs must be owned private files; output must be outside Git/cloud sync in a mode-0700 directory. The SQL contains a backend password and must remain mode 0600.

The transaction creates only the pinned 13-table authentication schema, restricted backend role and admin-only provenance marker. It refuses an existing schema/role/marker or migrated financial schema. It rejects inherited membership, unsafe role flags, financial privileges or callable public/private security-definer functions. It does not repair legacy ACLs automatically. The observed production PUBLIC-ACL audit was empty; execution rechecks the boundary atomically.

The marker records exact source/prefix hashes and a full catalog/ACL fingerprint, excluding role password and row contents. Later adoption locks all auth tables and compares structure, ownership, RLS, grants, functions, role attributes and membership. There is no blind `IF NOT EXISTS` adoption. The fourth migration's method-operation table is created only during full cutover.

## Confirm the exact owner in that store

After hosted acceptance, maintenance deployment and trust configuration are ready, run the approved Google-only local capture on `http://localhost:3109`, connected to this **final** auth store with its production Better Auth secret. The user signs in with Google and explicitly confirms the legacy account. No SMTP is needed. A new signup elsewhere or a different generated ID cannot substitute for this identity.

The capture stores a purpose-specific HS256 receipt in the private verification table. The read-only exporter produces a protected `better_auth_final_store_confirmation` artifact. The tools check its fixed local issuer, fixed confirmation audience, original subject/email, exact new ID, run UUID, live verified Google account/session and a maximum 15-minute age. SQL checks the receipt digest and exact live database rows before migration and again before commit. This receipt is not an API bearer token; canonical production JWKS and an old Auth0 refresh are not needed to verify it.

The original confirmation artifact and authenticated backup pin the old canonical subject. No legacy access token is refreshed or consumed. Capture is deliberately late: final backup, restore rehearsal and cutover must complete while the new receipt remains valid. An expired receipt requires another explicit confirmation, never a bypass.

## Final backup inputs

Use `scripts/prepare-account-migration.mjs --owner-sub "$CONFIRMED_LEGACY_SUBJECT"` in final-store mode with these explicit child-environment values:

- `MIGRATION_DATABASE_URL`, `MIGRATION_SSL_ROOT_CERT`, `MIGRATION_BACKUP_DIRECTORY` and `CREDENTIAL_ENCRYPTION_KEY`.
- `FINAL_OWNER_CONFIRMATION_FILE`: fresh exported final-store receipt artifact.
- `LEGACY_OWNER_CONFIRMATION_FILE`: original explicitly confirmed owner artifact.
- `LEGACY_MIGRATION_PARAMETERS_FILE`: original protected baseline parameter file.
- `BETTER_AUTH_SECRET`: the final store's receipt/session encryption secret.

This mode verifies the exact final store and owner rows read-only, and includes `public`, `private`, `supabase_migrations` **and `livestocks_auth`** in the authenticated encrypted archive. It does not need a legacy Auth0 access token. Keep `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` independently protected. A backup without the final login store is insufficient for cutover recovery.

## Gates and manual sequence

1. Pass hosted issuer/JWKS/role acceptance, both-account RLS, web/MCP scopes, live-session/approval revocation and private-response checks. Local tests do not replace this gate. Then review and execute only the auth-only preprovision package on the exact checked TLS connection.
2. Close every old anonymous deployment URL/alias/API and shared portfolio cache, including old JSON/HTML snapshots and MCP/widget paths. Stop old/background writers and service credentials. Database revocation cannot erase cached responses. Prepare the maintenance deployment and provider trust before capturing the fresh owner receipt.
3. Keep the independent encryption keys and tested encrypted baseline. Production connections require the exact project, explicit trusted CA and `verify-full`; never weaken hostname/certificate validation. Assign one operator for fresh capture and final execution.
4. `node scripts/cutover-personal-accounts.mjs --help` describes the review-only CLI. `--check` requires the original `--owner-file`, fresh `--binding-file`, canonical Better Auth config and an exact proved backup. It checks the current receipt/store read-only; it requires no legacy token refresh or canonical bearer token. Only after every gate passes may readiness be deliberately updated and a new package generated. `--prepare` never applies SQL.
5. Execute reviewed `01-freeze-and-drain.sql`: advisory/all-six-table exclusive locks, table **and column** revocation from PUBLIC/anon/authenticated/service_role, legacy RPC execution revocation, committed bundle-bound marker, then API-backend drain. If drain fails, keep maintenance closed and use only marker-checked `01b-retry-drain-only.sql`. Never blindly rerun freeze or reopen permissions.
6. Take the fresh encrypted final-store backup after drain and run its complete restore rehearsal. A pre-existing freeze marker is preserved under a separate name only in the local simulation; production markers are never removed or rewritten by these tools.
7. Generate and review `02-compare-and-migrate.sql` from that final manifest, protected parameters, fresh owner receipt and current source hashes. Settings are parsed as allowlisted data and become transaction-local GUCs on the same connection. The single transaction checks freeze/drain time, unchanged six-table hashes under exclusive locks, exact auth-store adoption, absent target history and all owner/provider invariants, then records four history entries atomically.
8. Enable the reviewed deployment only after fresh real-owner and second-account checks pass. Keep legacy deployments and cache paths closed.

For manual execution, use a fresh minimal child environment from `checkedProductionEnvironment()` and pass it directly to `psql -X -q -v ON_ERROR_STOP=1 -f <private-reviewed-file>` through a process-spawn API. Never put connection URLs/passwords in command arguments. Capture output/errors only in a protected file. `--check` does not configure an unrelated shell session.

After a connection error following commit, inspect the marker, all four history entries and authenticated behavior before assuming rollback. Recovery is a reviewed forward fix or a separately planned encrypted restore with reconciliation. **Restoring anonymous financial access is never a rollback strategy.**
