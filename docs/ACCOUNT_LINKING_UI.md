# Account merging interface contract

The Hebrew/English account-settings card and guarded server flow are deployed and explicitly enabled in production. Local defaults remain off: without `ACCOUNT_LINKING_ENABLED=true`, status returns `{ "available": false }`. [Production release evidence](verification/personal-accounts-production-release-2026-11-15.json) records the active rollout; [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md) covers recovery and authorization. A two-human-Google ceremony was explicitly waived and is not claimed verified; synthetic real-SDK/SQL preservation tests passed.

The provider-independent DTO is [`types/account-linking.ts`](../types/account-linking.ts). [`AccountLinking`](../components/auth/account-linking.tsx) is mounted in My account. [`account-linking-client.ts`](../lib/account-linking-client.ts) validates API responses, rejects API redirects and accepts navigation only to the current origin. The existing session DTO is unchanged. Linked sign-in methods come from the server's status response, never from a canonical account-ID prefix.

## Implemented server route contract (gated)

| Request | Contract |
| --- | --- |
| `GET /api/account/link/status` | Disabled response, or server-confirmed methods, opaque candidate handles and the current operation |
| `POST /api/account/link/start` | `{ candidateId }` → status |
| `POST /api/account/link/:id/reauth` | `{ step: "current" \| "other" }` → `{ reauthUrl }` |
| `POST /api/account/link/:id/confirm` | Exact reviewed pair and canonical target, review version/hash, explicit settings/key selections and confirmation → status |
| `POST /api/account/link/:id/resume` | Resume the same durable operation → status |
| `POST /api/account/link/:id/cancel` | Cancel only when still permitted → status |

Every mutation requires same-origin/CSRF validation and binding to the exact operation. Starting/discovering and proving identities require verified live sessions. After freeze deliberately revokes those sessions, recovery uses only the existing HttpOnly operation capability to resume that same already-confirmed job. Browser-supplied candidate IDs, target IDs, counts and choices are never authority. Candidate responses must contain only opaque handles; no email, subject, portfolio counts or financial records before both identity proofs.

The server now binds a single-use challenge, signs out the old SDK session, and returns a local `/sign-in` URL whose return path is the operation callback. That callback checks the exact new live session and subject. The component contains no provider authorization URL or bearer token. Google authentication continues through the existing approved provider flow; operation capability secrets never appear in URLs.

## Review, recovery and completion

After both proofs, `review_ready` supplies exactly two accounts with record counts, the canonical target, and explicit settings/Finnhub-key conflicts. Settings choices contain only persisted `currency`, `annualGrowthRate` and `refreshInterval` (minutes); interface language is a local browser preference and is not an account-setting conflict. Key values are never returned, only whether a key is configured. Confirmation remains disabled until all required choices and the acknowledgment are selected. Each distinct review hash/version resets those choices and consent. Source financial history must be preserved by the server; choosing active settings or a credential must follow the reviewed preservation contract.

`PROOF_EXPIRED`, `REVIEW_CHANGED` and `CONFLICT` discard the old review and reload authoritative status. Other errors prevent continuing until status refresh succeeds. The client handles `frozen`, `db_prepared`, `revocation_pending`, `ready_to_activate` and `reconcile_required`; it polls progress using GET only and offers resume only when the server says it is safe. It does not offer cancellation during a frozen/committing phase or silently begin a second merge.

On `completed`, the server supplies a same-origin `signInUrl`. The client validates it, clears the browser database client, broadcasts an account reset to other tabs, invalidates the current account session and navigates to fresh sign-in. **After a fresh canonical session is established, the status API must stop returning this completion redirect**, otherwise returning to Settings would cause a sign-in loop. Invalid destinations do not navigate or clear the session under an untrusted redirect.

## Verification

Synthetic fixtures and 23 targeted client/UI tests cover unavailable capability, opaque discovery, explicit conflict choices, exact review submission, stale review and expired proof, cancellation, durable resume, same-origin navigation, completion resets, StrictMode and aborted requests. The tests exercise mocked API contracts, not real identity proof or a database merge. No actual users, credentials or financial records are used by these fixtures.
