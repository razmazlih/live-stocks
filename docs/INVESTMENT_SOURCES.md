# Personal investment sources

Every account starts with one source, **מקור ראשי**. Users can create banks, brokerages, or other sources, rename them, and archive/restore them in Settings. The new-position form can create and select a source inline. Names are trimmed, required, unique per owner, and at most 80 characters; there is no product source-count limit.

A source UUID is its identity. `Position.location`, plan `location`, purchase `p_location`, URL `account`, and screenshot-sync `location` carry that UUID. Display names come from the owner's `investment_sources` catalog. Legacy bank URL filters resolve through `legacy_location`; unknown IDs never default to another source. Catalogs are paginated, private, and returned even when the portfolio is empty.

Archiving requires another active source, no positive current balance, and no pending plans. Balance is calculated from transactions and the latest reconciliation checkpoint rather than the stale opening quantity. Database guards enforce these rules and deny purchases, positive checkpoints, reopened positions, or new pending plans on archived/foreign sources. Successful purchase retries remain replayable after archiving. History is retained and remains part of portfolio calculations.

## Migration and account linking

Apply `20261116065346_screenshot_position_import`, `20261116073637_chat_sync_confirmations`, then `20261116084605_personal_investment_sources` in order. The source migration is transactional and stops if a frozen account merge needs recovery. It maps each referenced legacy bank to its own source, including closed holdings and plan-only references; empty users receive one primary source. Position, lot and plan IDs, prices, quantities, dates and original timestamps are preserved. Pending legacy sync cards are cancelled and must be prepared again.

Account linking transfers independent source IDs and includes source rows in its rollback/history manifest. Equal names are disambiguated with a stable source-ID suffix; matching names do not combine sources or financial ledgers. Source IDs referenced by holdings and plans remain stable.

## Coordinated release

1. Run the checks below and create an immutable deployment source copy. Build the production-target deployment without promoting domains.
2. Temporarily fence financial writes at the database so already-open tabs and direct REST clients cannot write while code/schema are incompatible. Record aggregate pre-migration financial digests privately; never put raw holdings or credentials into release logs.
3. Apply the ordered migrations. Compare all financial row IDs/business values/timestamps, allowing only the intentional `location` UUID mapping, and verify owner-consistent source foreign keys.
4. Promote the prepared compatible deployment, verify public routes and authenticated reads when a user session is available, then remove the write fence. If promotion fails, keep the fence and deploy the compatible source; an old enum client cannot safely write to the UUID schema.
5. Update the owned ChatGPT skill through its existing plugin release process and refresh cached tool definitions when that control is available. Server-side MCP advertises UUID source IDs; it does not grant source-management access to ChatGPT.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
python3 supabase/tests/run_investment_sources.py
PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 scripts/test-tenancy.py
python3 scripts/test-screenshot-sync-postgres.py
PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 scripts/test-better-auth-postgres.py
PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 scripts/test-account-linking.py
```

The native runners create disposable loopback PostgreSQL clusters and never load `.env` or connect to production. They cover migration preservation, source ownership, arbitrary third sources, purchase idempotency, archive/reconcile rules, screenshot confirmation, and the actual SDK account-merge/recovery flow. The account-linking privilege tests require PostgreSQL 16+.

Browser screenshots use synthetic accounts/data; they are not screenshots of the owner's portfolio. Physical-device testing and the ChatGPT host's iframe rendering are separate from these checks.

## Published release — 16 November 2026

The production domain points to deployment `dpl_BSoaf6YoP2nKq7MCidzdetUFa8pD`. All six financial-table digests and the legacy source-assignment digest matched before/after migration; all 17 positions and 55 lots were preserved. The temporary authenticated/sync table write grants were restored after the prepared deployment was promoted. No source ownership foreign-key violations remained.

Hosted migration versions are `20261116090032` (screenshot import), `20261116090053` (chat confirmations), and `20261116090509` (personal sources). The hosted apply API assigns versions at application time; reconcile these by migration name with the source filenames above instead of replaying them through a blind `db push`. Managed PostgreSQL 17 required transaction-local SET membership for the new executor and replacement of the merge function under its existing owner; executor schema CREATE was revoked again before commit.

The connected production MCP call returned the source catalog with valid UUIDs and names. The existing workspace plugin was updated to 1.1.2 with only source-catalog guidance, preserving its App/audience/assets and existing research skill. The separate local screenshot-sync skill draft was not included in that plugin update.

See [production verification](verification/investment-sources-production-2026-11-16.json) and [synthetic Chrome checks](verification/investment-sources-browser-2026-11-16.json).
