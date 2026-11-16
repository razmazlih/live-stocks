# Separate permission for recording completed transactions

`portfolio:transactions` is an optional MCP scope for recording purchases and sales the user has already made. It is distinct from `portfolio:sync` (screenshot balance reconciliation) and `portfolio:write` (never accepted on MCP tokens). `portfolio:read` remains required. Website tokens cannot carry either MCP bookkeeping scope.

The provider advertises the new scope, but its default registration/authorization scopes remain the unchanged read-only `AUTH_SCOPES`. Previously issued access tokens, refresh grants and user consents are not expanded by a deployment or client-policy update. The consent screen explains completed-transaction recording and the per-entry card confirmation requirement, including partial sales; it does not describe that permission as read-only.

## Operator activation

After the server and transaction schema are ready, use the existing operator-only bootstrap with the exact established origin, client ID, callback list and verified operator session. Configuration, callback and cookie files must be owner-only (0600) files outside the checkout. Review first, then repeat the same command with `--apply`:

```sh
node scripts/seed-mcp-client.mjs \
  --config-file /private/operator/auth-config.json \
  --cookie-file /private/operator/session-cookie.txt \
  --callbacks-file /private/operator/exact-callbacks.json \
  --origin https://YOUR_EXISTING_LIVESTOCKS_ORIGIN \
  --client-id YOUR_EXISTING_MCP_CLIENT_ID \
  --operator-id YOUR_VERIFIED_OPERATOR_ID \
  --enable-portfolio-transactions
```

This explicit flag adds transaction recording to both stored capability ceilings: the OAuth client and its canonical resource. It preserves the existing callback/resource binding, secret, PKCE, mandatory consent, identity scopes, and any already-approved screenshot-sync ceiling. Repeating it is idempotent. It never adds screenshot-sync to a read-only client unless `--enable-portfolio-sync` is separately provided. Unreviewed scopes (including `portfolio:write`), disabled resources, and unexpected policy settings cause refusal.

The user must then authorize the newly requested `portfolio:transactions` scope through the existing ChatGPT connection. Existing `portfolio:sync` authorization alone does not permit recording BUY or SELL lots. Refreshing an old read-only/screenshot-only refresh token cannot add the new permission.

## Verification

Focused tests cover signed token boundaries, optional scope defaults/union, explicit consent text and bootstrap guardrails. The native Better Auth test also verifies an actual consent/code/token exchange for transaction-only permission after enabling the ceiling, and verifies that old screenshot/read-only tokens stay unexpanded and refresh escalation is refused. Native tests use disposable localhost PostgreSQL and synthetic accounts only; they are not proof of a production consent flow.


## Production activation on 16 November 2026

The additive transaction migration was applied to the existing `supabase-live-stocks` project. The operator enabled `portfolio:transactions` on both the exact registered `livestocks-mcp-chatgpt` client and canonical `https://razmaz-live-stocks.vercel.app/api/mcp` resource, guarded by their observed prior scope arrays and SHA-256 hashes of every non-scope/non-timestamp field. The invariant hashes were identical afterward. No user grant, token, session, callback, secret, signing, expiry, PKCE or consent field changed. Financial table counts and digests matched before and after the migration/configuration update.

Production deployment `dpl_3FJff5RdRpGHTxdZcLffmRBEyjF5` serves commit `c541bf7` on the existing domain. Public protected-resource discovery includes the optional transaction scope; unauthenticated MCP access still returns 401. Plugin 1.2.0 was published and source-read back; existing App tools were refreshed. A connected profile read still succeeds. New transaction consent and a real transaction-card write have not been performed in the owner's personal account; first use must obtain the user's new optional consent.
