# Canonical accounts and lossless merge foundation

Status: the production ownership/provider cutover completed on 2026-11-15. The general two-profile proof/callback API and resumable worker are now implemented and tested locally, but **general merging remains disabled and undeployed**. See [the guarded merge service](ACCOUNT_LINKING.md) for its release gates. Matching verified emails suggests a possible connection; it never grants access or transfers ownership.

The database migrations are separate from the unchanged original isolation migration:

- `20261114145729_canonical_profiles_and_lossless_merge.sql`: canonical identity mapping, write fencing, lossless merge jobs, archived settings/credentials and atomic widget snapshots.
- `20261114151506_better_auth_private_sessions.sql`: Better Auth 1.7.23's generated private schema, narrow backend role, live session/approval checks and atomic merge revocation.

## Ownership and preservation

`private.identity_profiles` maps an exact trusted `(issuer, subject)` to `public.user_profiles.id`. The application's principal keeps both the raw subject and canonical profile ID. Existing query filters use the canonical ID. An existing profile ID cannot acquire a new Better Auth issuer mapping merely because the subject string or email matches.

For the legacy portfolio, the explicitly confirmed original profile stays primary. Otherwise primary selection prefers a pinned profile, then one with meaningful data, then the oldest profile and stable ID. Both identities must prove fresh control before preview and confirmation.

The merge physically transfers the six tables' `user_id` fields, preserving every original row ID, business field, timestamp and lot/plan parent. Duplicate symbol/bank positions remain separate FIFO ledgers. `consolidated_into_position_id` selects a single target for future purchases; it does **not** remove a historical ledger from valuation or accounting. Old purchase request retries return their original position. All banks remain present.

Both settings rows remain stored, with one explicitly chosen `is_active` row; normal RLS hides inactive rows. Watchlist groups/tickers are retained without deduplication. Both original encrypted credentials and their original AAD subjects are archived privately; the worker must reencrypt the selected credential for the canonical profile using the existing AES-GCM envelope contract. No plaintext key belongs in SQL, logs or browser responses.

`livestocks_merge_executor` is NOLOGIN, NOINHERIT and NOBYPASSRLS. Its financial privileges are SELECT/UPDATE only. Triggers restrict its changes to ownership and merge metadata and preserve timestamps. Ordinary financial writers take a shared profile row lock; merge freeze takes exclusive profile locks in stable order, drains existing writes and rejects changed preview hashes. A failed preparation rolls back its entire transfer while retaining the prior freeze.

## Service RPC contracts

These public functions are executable only by `service_role`; the browser must never call them directly or receive that credential. The API must authorize the caller's relationship to the exact job on every operation.

| RPC | Parameters | Result / purpose |
| --- | --- | --- |
| `server_identity_resolve` | `p_issuer text, p_subject text, p_email_hash text = null, p_auth_session_created_at bigint = null` | `{profile_id, raw_subject, state, min_auth_session_created_at, identity_version}`; state is `active`, `blocked`, or `reauthentication_required`; numeric version starts at 1 and cutoff at 0. |
| `server_bootstrap_web_account` | issuer, subject, optional origin with the same parameter names | Resolves identity and creates exactly one active default settings row under the profile fence. |
| `server_merge_candidates` | `p_issuer, p_subject` | Matching registered email-HMAC candidates; backend only, not an authorization decision. |
| `server_merge_create_guarded` | issuer, actor/other subject, request UUID, immutable `p_expires_at` | New application entry: same-request advisory lock, existing-job recovery before expiry rejection; delayed expired creation is rejected. |
| `server_merge_lookup_guarded` | same five arguments | `{job,expired}` under the same request lock and DB clock, bound to the exact pair; permits safe abandonment of an expired absent intent. |
| `server_merge_create` | `p_issuer, p_actor_subject, p_other_subject, p_request_id uuid` | Durable job; retries of the same request/pair return the existing job. |
| `server_merge_read` | `p_job_id uuid` | Job metadata and revocation outbox; excludes secret material and financial manifest. |
| `server_merge_proof` | `p_job_id, p_subject, p_email_hash, p_auth_time bigint, p_nonce_hash` | Records a server-verified fresh proof for one exact participant and identity version. |
| `server_merge_preview` | `p_job_id` | Counts, duplicate position IDs, settings/key conflicts, key ciphertext versions, job version and preview hash. |
| `server_merge_freeze` | `p_job_id, p_expected_version bigint, p_preview_hash, p_settings_source_profile_id, p_credential_source_profile_id = null` | Revalidates both proofs and preview under locks, freezes both profiles, revokes widgets/MCP connections and queues all identity/client revocations. Better Auth additionally revokes approvals and deletes both profiles' sessions in the same transaction. |
| `server_merge_secret_material` | `p_job_id` | Selected ciphertext, original AAD subject, canonical profile and version; worker-only, never frontend. |
| `server_merge_prepare` | `p_job_id, p_encrypted_value = null, p_credential_version = null` | Transfers ownership, archives originals and verifies exact six-table preservation; idempotent after preparation. |
| `server_merge_finish` | `p_job_id, p_revocation_receipt jsonb` | Requires complete `{revoked:[{subject,client_id,verified_at}]}` outbox coverage, then activates aliases with a fresh-session cutoff. Widgets/MCP remain disabled. |
| `server_merge_fail` | `p_job_id, p_reason` | Safe error code; cancels a pre-freeze job, or leaves a frozen job in `reconcile_required`. |
| `server_widget_snapshot` | `p_token_hash` | One fenced `{user_id,expires_at,positions,position_lots,settings,encrypted_credential,credential_aad_subject}`; arrays always present, settings/ciphertext nullable. Server-only ciphertext. |

Job states: `proofs_pending → review_ready → frozen → revocation_pending → completed`, with `prepared` reserved and `reconcile_required` / `cancelled` for recovery. Participants cannot join another active job. Freeze, preparation and completion should be separate committed transactions. Never unfreeze on an ambiguous worker failure. Reconciliation must inspect the same durable job rather than creating a competing transfer.

The local server now implements nonce/session-bound dual proofs, opaque discovery, preview/choice confirmation, durable stage retries, and authorized recovery/status endpoints. Actual two-identity Google browser verification and worker scheduling remain release gates; the feature stays disabled. [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md) documents the exact boundary and local commands.

## Better Auth live token boundary

The generated 13-table schema is `livestocks_auth`, outside exposed REST schemas. Tables enable RLS and grant CRUD only to `livestocks_auth_backend`, a LOGIN role without superuser, BYPASSRLS, role creation, database creation, inheritance or financial-table privileges. The migration provides **no password**; deployment must provision a dedicated protected credential separately. Use the backend pool's fixed `search_path=livestocks_auth`, verified TLS for hosted connections, and never put this URL in a public environment variable.

Web tokens require an actual live, verified user/session, exact configured issuer/client/audience, the required portfolio scopes and signed session fields. A new verified web session may pass the service guard before its empty profile is created. Existing frozen/blocked/retired profiles do not. MCP additionally requires an immutable, unrevoked approval reference. Refresh may check an existing approval but must never create a replacement for a revoked one.

| Entry point | Contract |
| --- | --- |
| `private.ensure_oauth_approval` | Backend-only `(p_user_id text, p_session_id text, p_client_id text) → uuid`; initial verified login/consent only. User ID is the **raw auth user ID**. |
| `private.check_oauth_approval` | Backend-only `(p_id uuid, p_user_id, p_session_id, p_client_id) → {valid, created_at?, expires_at?, auth_session_created_at?, profile_id?}`. |
| `private.revoke_oauth_approvals` | Backend-only `(p_user_id, p_client_id = null, p_session_id = null) → integer`. |
| `public.server_better_auth_token_valid` | Service-only `(p_subject, p_session_id, p_client_id, p_grant_id uuid = null) → boolean`; required by API authentication, including nonfinancial endpoints. |
| `public.server_revoke_canonical_mcp_approvals` | Service-only `(p_profile_id text) → integer`; revokes all canonical-profile MCP approvals. Connection `disconnect` invokes it too. |

Signed `sid` and `https://livestocks.app/auth_session_id` must match the actual session. `https://livestocks.app/auth_session_created_at` must equal its database creation timestamp in integer seconds. MCP also signs `https://livestocks.app/grant_id`. Merged identities require session origin strictly greater than their cutoff: missing/old origins fail closed, with no fallback to access-token `iat`. Deleted sessions and revoked approvals invalidate already-minted tokens at both API and RLS checks.

## Explicit provider configuration and deployment prerequisites

The new migration accepts these transaction-local settings, all-or-none:

- `app.better_auth_issuer`
- `app.better_auth_website_client_id`
- `app.better_auth_mcp_client_id`
- `app.better_auth_website_audience`
- `app.better_auth_mcp_audience`

Without them it leaves the existing Auth0 configuration unchanged for regression/rehearsal. With them it sets `private.auth_config.auth_provider = 'better_auth'`. Existing old-issuer mappings remain recorded, but old-issuer JWTs no longer authorize data.

An optional `app.better_auth_legacy_owner_subject` binds that **explicitly verified new auth subject** to the already pinned `app.legacy_owner_subject` profile. Both values must come from the reviewed owner handoff; never infer them from email or signup order. Omitting the binding does not give the first registrant legacy data.

Before hosted cutover, verify managed PostgreSQL permissions for creating the two narrow roles and transferring function ownership; the native superuser fixture cannot prove those hosted permissions. Provision the backend password and approved application clients through protected administration, verify real signing/JWKS and Supabase REST compatibility, and rehearse **all current migrations** against a newly restored encrypted backup. The final four-migration restoration/adoption proof and completed production cutover are recorded in the cutover runbook. Old cutover packages must never be reused for a later schema change.

## Reproducible local evidence

Run `python3 scripts/test-tenancy.py`. It starts only a fresh loopback PostgreSQL cluster, never loads `.env` or accepts a hosted URL, and cleans up the cluster. All 11 stages passed, including legacy rollback/preservation, authenticated ownership, purchase retries, lossless merge rollback, origin rejection, real two-session write draining, private auth-role isolation, first login, session expiry/deletion and durable approval revocation.

The suite writes only a synthetic SQL-produced before/after fixture to `/private/tmp/livestocks-account-merge-fixture.json` for the separate fixed-price/FIFO integration checks. Those calculation checks passed too. Run `python3 scripts/test-better-auth-postgres.py` for the separate actual-provider gate. It provisions a fresh local cluster, executes `__tests__/better-auth-postgres.test.ts` using only the narrow authentication backend role, disables `.env` loading, mocks email delivery, and removes its runtime afterward. This passed: two verified synthetic users, real web/MCP signatures and JWKS, initial/refresh approval-origin continuity, wrong-resource and PKCE rejection, and signout invalidating refresh/web sessions. Both the original temporary provider runtime and the reproducible runner's runtime were stopped and removed.

These checks are local and synthetic. The separate hosted provider gate, production cutover and owner Google login subsequently passed on 2026-11-15; they do not prove the new general merge browser flow. Google-only production does not require email delivery. General merge enablement remains a separate, uncompleted release gate.
