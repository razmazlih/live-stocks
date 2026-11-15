# Activate the existing LiveStocks connection

This is an activation checklist, not evidence of a completed ChatGPT connection. The hosted provider and isolated Supabase fixture gate passed; the production issuer trust is configured. Neither result proves that the existing ChatGPT App can complete its OAuth flow. Production portfolio migration and maintenance release are controlled separately.

## Preserve the existing object

Read-only cloud package inspection on 2026-11-15 confirmed:

| Field | Existing value |
| --- | --- |
| App ID | `asdk_app_6af6d6f889a88191ae50abfc0070421b` |
| Plugin ID | `plugin_asdk_app_6af6d6f889a88191ae50abfc0070421b` |
| Display name | LiveStocks |
| Visibility | USER / PRIVATE |
| Published package version | `1.1.0` |
| Observed release | `pluginrel_6af842632d8c8191aa9425bf0485c771` |
| App binding | `.app.json` → the App ID above |

The current cloud package contains `.app.json`, `.codex-plugin/plugin.json`, and the analyst skill. It does not contain the host OAuth settings or redirect URI. Preserve the App binding, presentation, visibility and IDs. Do not recreate the App or add a second MCP connection in a package archive. Re-read the release before any package update and use its expected-release guard.

Existing connection: [LiveStocks](https://chatgpt.com/plugins/plugin_asdk_app_6af6d6f889a88191ae50abfc0070421b).

## Activation sequence

1. Wait for the rollout owner to confirm production migration, owner binding, financial integrity verification and permission to release maintenance. Do not refresh host metadata against the temporary maintenance response.
2. Check the anonymous production contract: MCP rejects unauthenticated requests with `401` and the protected-resource `WWW-Authenticate` challenge; discovery and public JWKS return `200`; financial endpoints reveal no anonymous portfolio. The exact resource is `https://razmaz-live-stocks.vercel.app/api/mcp`, issuer is `https://razmaz-live-stocks.vercel.app/api/auth`, and resource metadata is `https://razmaz-live-stocks.vercel.app/.well-known/oauth-protected-resource`.
3. Open the **existing** connection's management page. After authorization to activate, refresh its metadata and verify that OAuth is advertised. Observe whether its controls support a predefined client and `client_secret_post`. Copy the exact redirect URI shown there. These controls and the production callback have not yet been verified for this existing App. If the host cannot edit this connection's authentication mode or accept the configured static client, record the actual limitation and stop; do not delete/recreate it or silently enable DCR.
4. Review and run the operator-only static-client bootstrap described below using that exact callback and the existing configured client ID/secret. Configure the host's corresponding predefined-client settings through its owning management UI. Keep secrets out of screenshots, transcripts, command arguments and package files.
5. Start the connection from ChatGPT. The human signs in with Google on the canonical site and sees the on-site consent screen. Verify its account and read-only portfolio permission before the human approves. Do not approve on the user's behalf. The callback must return to the existing App.
6. In a fresh ChatGPT conversation, verify the seven tools listed below and call `get_profile`. Compare its canonical account ID with the website's account through private verification. Then request a portfolio snapshot and compare a small set of totals/position counts with the website; do not copy holdings into public evidence.
7. Exercise an actual host refresh after the five-minute access token lifetime. Record successful access and unchanged canonical profile; distinguish verified host refresh from merely reconnecting or obtaining a new authorization code. Never extract host tokens into the conversation.
8. Exercise the website's MCP disconnect control. Verify that the prior connection cannot keep reading and that refresh cannot revive the revoked approval. Reconnect through fresh human consent and verify the same canonical profile. This does not delete or recreate the App.
9. If the analyst skill/package needs its prepared update, publish only after the affected host checks pass and explicit activation authorization covers it. Preserve presentation and IDs, guard the expected release, then read back the files/version. Package publication and server metadata refresh are separate operations.

OpenAI documents [predefined OAuth clients, PKCE, resource binding and redirect selection](https://developers.openai.com/plugins/build/auth) and the [existing-connection metadata refresh and retest flow](https://developers.openai.com/plugins/deploy/connect-chatgpt). Use the callback displayed by the host: its stable and callback-specific modes differ. Do not infer the callback from an example URL. The provider advertises OIDC scopes, so the static registration includes them in addition to the portfolio permission.

## Static-client bootstrap

Use the existing [operator CLI instructions](OAUTH_CONSENT.md#operator-only-client-bootstrap). The script is `scripts/seed-mcp-client.mjs`; review mode performs no database mutation. It requires three owner-only files outside the repository: exact deployment auth configuration, a current verified production website session's Cookie header, and the observed callback array. The explicit operator ID is the raw Better Auth user ID, which can differ from the canonical portfolio profile after an account merge.

```sh
node scripts/seed-mcp-client.mjs \
  --config-file /private/path/auth-config.json \
  --cookie-file /private/path/operator-cookie.txt \
  --callbacks-file /private/path/callbacks.json \
  --origin https://razmaz-live-stocks.vercel.app \
  --client-id EXACT_CONFIGURED_MCP_CLIENT_ID \
  --operator-id VERIFIED_PROVIDER_USER_ID
```

Append `--apply` only for the authorized activation. Do not use a localhost owner-confirmation receipt or an old Auth0 cookie as the operator session. Remove the temporary cookie file after use.

The registration is confidential, uses `client_secret_post`, requires S256 PKCE and consent, and permits authorization-code plus refresh grants. Its sole resource is the canonical MCP URL. Its scopes are `openid email profile offline_access portfolio:read`. The seeder refuses mismatched existing registrations and verifies the configured secret; it does not silently rotate or overwrite a client.

## Expected tools and acceptance record

The source advertises `get_profile`, `get_research_brief`, `get_portfolio_snapshot`, `get_close_pair_proposals`, `validate_close_proposal`, `get_market_quotes`, and `validate_action_plan`. Every tool requires OAuth scope `portfolio:read` and is read-only. `get_profile` returns only its canonical `id` and carries the host profile annotation. Proposal validation must still reject a stale or another account's snapshot.

Record timestamps, App/plugin/release IDs, observed callback, metadata checks, tool names, profile-match boolean, portfolio-match boolean, refresh result, disconnect result and reconnect result. Keep credentials, cookies, raw tokens, owner identity and portfolio values out of the public report. A missing host check remains **unverified**, even when native provider tests and managed Supabase JWT/RLS checks pass.
