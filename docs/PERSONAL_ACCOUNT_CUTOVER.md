# Personal-account production cutover

**Blocked after the additional requirements on 14 November.** The same-email account merge and on-site login must pass their full preservation, concurrency and refresh-revocation gates first. The package below describes the earlier, single-migration rehearsal only. `--prepare` now refuses to generate a production package; existing protected SQL artifacts must not be applied. Regenerate and restore-rehearse the complete migration bundle after these gates pass. No production freeze or migration has occurred.

**Prepared, not executed.** Target: Supabase project `osvwctooasdxsztatirz`. No freeze, connection drain, production migration or rotating-refresh-token consumption was performed while preparing this procedure. Complete the remaining hosted/Auth0/deployment gates before authorizing maintenance.

The reviewed migration is `20261114114916_auth0_user_isolation.sql`, SHA-256:

```text
92f2a3c6bd5255029232576c2c147ced84dbc0fa3c527c6c4df6703e5f32dffc
```

The confirmed identity is the exact `userId` in the protected `~/.codex/secrets/livestocks/personal-accounts-2026-11-14-owner.json`, which must match the verified backup's `ownerSubject` and a freshly verified website access token. Never substitute a Google/password identity because its email matches. The original verified backup is `~/.codex/backups/livestocks/livestocks-account-migration-vtG1TK/`. Its original snapshot is **not** the final cutover snapshot.

## Prepared artifacts and local proof

The review-only package is outside Git/iCloud at `~/.codex/backups/livestocks/cutover-review-2026-11-14/`, directory mode `0700`, files mode `0600`:

- `01-freeze-and-drain.sql`: commits the permission freeze, then drains existing API connections in a second transaction.
- `01b-retry-drain-only.sql`: narrowly retries draining if the freeze committed but draining failed. It verifies the exact freeze marker first.
- `02-compare-and-migrate.sql`: uses the selected backup baseline, and refuses execution unless that backup was generated **after** a committed freeze and completed drain. The currently prepared copy therefore cannot migrate production; regenerate this file after the final backup/restore.

The generated SQL passed on a fresh local restoration of the actual encrypted backup, with connection defaults set read-only. Evidence is in the protected backup's `restore-report.json`, including `cutover` checks:

- The freeze committed and terminated an already-running local `authenticator` session.
- A pre-freeze snapshot and a changed row-count baseline were rejected.
- A unique deliberately injected error immediately before the final commit rolled back the migration while leaving the earlier permission freeze intact.
- Successful execution preserved all six canonical financial hashes, IDs, timestamps and exact ownership; the encrypted credential decrypted to its original value.
- Migration history was recorded in the same transaction. Financial-table access for `service_role` became read-only, and anonymous access remained denied.
- The disposable cluster was removed. Hosted writes: **none**.

## Gates before maintenance

1. Finish the real-provider/hosted gateway checks and inspect the staged production deployment. Verify the exact Auth0 issuer, distinct web/MCP clients and audiences, verified-email claims, literal `authenticated` database role, RLS, revocation and private responses. A passing local REST/browser test does not replace the hosted gate.
2. Close every old unauthenticated deployment URL/alias/API and invalidate any shared portfolio cache. Include old JSON/HTML AI snapshots and old MCP/widget paths. Prevent background writers and stop use of the old service key. A database permission change cannot erase a snapshot already cached in an older deployment.
3. Retain the independent encryption key and current encrypted backup/restore evidence. Use libpq `18.7` at `/opt/homebrew/opt/libpq/bin`, the official project CA, and `verify-full`. Do not weaken TLS validation.
4. Refresh/reacquire the confirmed owner's website token through one designated operator. Coordinate the rotating refresh token; never run parallel refreshes. Preserve the exact confirmed subject. No tool here automatically refreshes it.
5. Supply configuration explicitly through a protected process environment; no `.env` loading and no credentials in command arguments. `MIGRATION_DATABASE_URL`, `MIGRATION_SSL_ROOT_CERT` and Auth0 configuration must be the reviewed production values. `APP_BASE_URL`/audiences use the canonical production origin when preparing the final backup.

## Read-only preflight and package generation

Use private path variables; their values are file locations, not tokens:

```sh
node scripts/cutover-personal-accounts.mjs --check \
  --project osvwctooasdxsztatirz \
  --backup-directory "$VERIFIED_BACKUP_DIRECTORY" \
  --owner-file "$CONFIRMED_OWNER_FILE"

node scripts/cutover-personal-accounts.mjs --prepare \
  --project osvwctooasdxsztatirz \
  --backup-directory "$VERIFIED_BACKUP_DIRECTORY" \
  --owner-file "$CONFIRMED_OWNER_FILE" \
  --output-directory "$NEW_PRIVATE_SQL_DIRECTORY"
```

`--check` verifies the current Auth0 token's signature and exact website claims, confirms the subject against the owner file/backup, validates the direct-project or project-qualified pooler connection, and performs only read-only SQL. Expired tokens fail before the database connection. `--prepare` verifies the encrypted artifact, matching successful restore/migration proof and pinned migration hash, then emits SQL only; it does **not** establish a current identity. `--apply` is deliberately rejected.

## Explicit execution sequence for the final operator

1. After the maintenance gates and fresh `--check` pass, review and manually execute **only** `01-freeze-and-drain.sql` using the exact checked connection. The SQL acquires an advisory lock and all-six-table `ACCESS EXCLUSIVE` locks, revokes table **and column** privileges from `PUBLIC`, `anon`, `authenticated` and `service_role`, and revokes public-schema function execution. It creates an admin-only `private.account_cutover_state` marker and commits. This blocks both ordinary API traffic and legacy definer RPC entry points.
2. The second transaction verifies effective privileges, terminates only existing `authenticator` backends (not the operator or arbitrary database sessions), and records `drained_at`. New API connections cannot access the frozen tables/functions. If drain fails, **leave the freeze in place**. Investigate privileges/remaining sessions without printing SQL text or data, then use the reviewed drain-only file. A repeated drain moves the cutoff and requires a new subsequent backup.
3. With access frozen and drained, run `prepare-account-migration.mjs` again for the same freshly verified owner. This produces the **final** encrypted snapshot and protected parameters. Restore-test that final artifact with `restore-account-backup.mjs --rehearse-migration`; the preparation manifest alone is insufficient. Keep original and final backups independently identifiable.
4. Generate a **new** protected SQL package against that final backup and its successful restore report. Run fresh `--check` again. Do not execute its freeze file again: production is already frozen. Review the final `02-compare-and-migrate.sql`.
5. Execute that final file as one `psql` invocation/connection with `ON_ERROR_STOP=1`. It uses explicit `BEGIN READ WRITE`, UTC, lock/statement timeouts, the same advisory lock and exclusive locks on all six tables. Under those locks it requires the matching freeze/drain marker, a subsequent final-backup timestamp, absent migration history, revoked legacy privileges and **exact counts/full original row digests**. It then sets the protected GUCs, executes the pinned migration body, verifies the transformed financial digests/exact owner, grants only financial-table `SELECT` to `service_role`, records the migration in `supabase_migrations.schema_migrations`, marks completion and commits. Only then does it notify PostgREST to reload its schema.
6. Verify authenticated owner reads, an independent user's empty portfolio, MCP read-only/revocation behavior, credential decryption without printing it, widget isolation/expiry, and anonymous denial. Attach the approved deployment/domain and enable normal access only after these checks pass. Keep old deployments closed.

For every manual SQL execution, construct a **fresh minimal child environment** with exported `checkedProductionEnvironment()` from `scripts/cutover-personal-accounts.mjs`; pass its result directly to `psql` via a process-spawn API. This repeats exact-project and CA/hostname validation and avoids ambient libpq fallback. The required invocation arguments are `-X -q -v ON_ERROR_STOP=1 -f <reviewed-private-SQL-file>`; no URL/password belongs in them. The helper's default read-only connection is retained; only the reviewed SQL's explicit `BEGIN READ WRITE` enables its authorized transaction. Capture stdout/stderr in a new mode-`0600` file inside the private review directory, never in terminal output or Git. `--check` does not export an environment to a parent shell: do not assume an unrelated `psql` command uses the checked connection.

## Failure handling

Never grant anonymous/public permissions back, restore an unauthenticated app build, or automatically retry the whole sequence. Before freeze commit, a failed freeze transaction changes nothing and maintenance remains unverified. After freeze commit, every later error leaves the source frozen; a failed migration transaction also rolls back its history record and temporary grants. A mismatch means take/verify a new frozen baseline or investigate; do not edit expected digests to bypass it.

After the final commit, a connection failure or failed schema notification does not imply rollback. Inspect the cutover marker, migration history and authenticated behavior before deciding what to do. Prefer a forward fix; any restore requires a separately reviewed maintenance action and reconciliation of changes after the backup. Do not drop the private cutover marker as a retry mechanism.
