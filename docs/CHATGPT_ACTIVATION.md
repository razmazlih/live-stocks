# LiveStocks ChatGPT OAuth activation

The user-approved replacement **LiveStocks (OAuth)** is now connected privately. Real connected-tool calls to `get_profile` and `get_portfolio_snapshot` succeeded on 2026-11-15 after human consent. After explicit user approval, the old LiveStocks plugin was uninstalled; LiveStocks (OAuth) is now the sole installed LiveStocks connection. The old owned cloud artifact and repository source were not permanently deleted. The earlier inspection records below describe the original object and the decision that required a new OAuth-capable object; they are historical, not the current activation status.

## Current OAuth connection

[Open LiveStocks (OAuth)](https://chatgpt.com/plugins/plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b).

- App: `asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b`; plugin: `plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b`.
- Visibility: USER / PRIVATE. Static client `livestocks-mcp-chatgpt`, `client_secret_post`, exact observed callback `https://chatgpt.com/connector_platform_oauth_redirect`.
- Human consent completed; settings read back OAuth supported and used. All seven current server tools are exposed by the new connected namespace.
- Package `1.1.0`, release `pluginrel_6af9b6cc71008191a30dc689a0af9a58`, contains the complete OAuth-first analyst skill. Source and App binding were read back and compared byte-for-byte after the update. See [the retained package source](../plugins/livestocks-oauth/README.md).
- Real `get_profile` and `get_portfolio_snapshot` calls succeeded without reconsent after the initial five-minute access lifetime. Production read-only refresh-family timestamps independently confirm rotation from the initial 13:40:37 UTC grant through 13:53:59 UTC, without reconsent. After the website disconnect, the connected tool returned an authentication error and no profile; the host requested authentication. Following reconnect preparation and accepted host authentication, a new tool call returned the same canonical profile. Independent server readback confirmed the initial approval was revoked and a fresh approval was created at 14:06:41 UTC, after reconnect preparation at 14:04:03 UTC. The host handled its authentication challenge internally, so this evidence does not expose a raw rejected-JWT HTTP response. See the [activation record](verification/chatgpt-oauth-activation-2026-11-15.json).

No raw owner identity, portfolio values, cookie or token is retained in the public evidence. The new object was created after explicit user approval to retain the old one during activation. After successful lifecycle checks, the user separately approved uninstalling the old plugin. The new connection continued to pass `get_profile` after that uninstall.

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

## Observed activation blocker (2026-11-15)

After the website launch, the authorized refresh of this existing App returned **“Couldn't update the app. Try again”**. Its settings continued to show authorization supported/used `None`, with the same App and version IDs. The personal settings page exposed no OAuth editor or callback. The exact existing-plugin workspace administration page also exposed no authentication editor. The official publisher portal's current Personal Organization / Default project showed empty submission onboarding, rather than this App.

These observations establish a limitation of the inspected controls, not proof that every supported migration path is unavailable. No new App was created, no package was published, no callback was guessed, and server authentication remains enforced. The existing connection is not yet usable with the new personal-account authentication. Resolve an ID-preserving host configuration path, or obtain an explicit decision about a replacement connection, before seeding a host client. See the [sanitized host inspection record](verification/chatgpt-existing-app-refresh-2026-11-15.json).

A separate, **unsubmitted** new-connection form successfully discovered the production provider and displayed `https://chatgpt.com/connector_platform_oauth_redirect` as its callback. It offers a User-Defined OAuth Client, client ID/secret inputs and `client_secret_post`, with the correct canonical endpoints/resource and OIDC scopes. Its final button is **Create as a plugin**; this is a replacement-object path, not an observed way to preserve the old App ID or transfer its skill automatically. No credentials were entered and nothing was created. See the [form-only verification](verification/chatgpt-unsubmitted-oauth-form-2026-11-15.json). A replacement still requires an explicit rollout decision and complete host verification.

Google's separately approved audience publication was completed and read back as **In production / External**. This makes the Google configuration public but does not itself prove a new non-test user's login or ChatGPT OAuth connectivity; see the [Google publication record](verification/google-public-sign-in-2026-11-15.json).

## Repeatable activation and acceptance sequence

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

The source advertises `get_profile`, `get_research_brief`, `get_portfolio_snapshot`, `get_close_pair_proposals`, `validate_close_proposal`, `get_market_quotes`, and `validate_action_plan`. Research tools require OAuth scope `portfolio:read` and remain read-only. The screenshot-sync additions described below use a separate optional scope. `get_profile` returns only its canonical `id` and carries the host profile annotation. Proposal validation must still reject a stale or another account's snapshot.

Record timestamps, App/plugin/release IDs, observed callback, metadata checks, tool names, profile-match boolean, portfolio-match boolean, refresh result, disconnect result and reconnect result. Keep credentials, cookies, raw tokens, owner identity and portfolio values out of the public report. A missing host check remains **unverified**, even when native provider tests and managed Supabase JWT/RLS checks pass.


## Optional in-chat screenshot sync (PR implementation)

The default registration and every existing grant remain read-only. Operator opt-in uses the same reviewed seeder command above with the additional --enable-portfolio-sync flag; review the exact client/callback target before --apply. This only expands the existing client's allowed scopes. A user must separately consent to a signed OAuth request containing portfolio:read portfolio:sync. Old access/refresh tokens do not acquire sync rights. Never request portfolio:write for the MCP client or change callback URLs, IDs, secrets or sharing.

Protected-resource discovery lists the optional sync scope. prepare_screenshot_sync and the app-only confirm_screenshot_sync declare read+sync; an old read-only token receives an insufficient_scope tool-result challenge, allowing the host to run its OAuth flow. The consent screen clearly distinguishes the narrow bookkeeping capability from trading/general writes.

Source tools now also include find_purchase_date_candidates, prepare_screenshot_sync, review_screenshot_sync, confirm_screenshot_sync and cancel_screenshot_sync. Review renders from ui://livestocks/screenshot-sync-v3.html inside ChatGPT. The confirmation capability is in private result metadata only; confirm/cancel are app-only. Read review output never includes that secret. Corrections supersede old cards, including incomplete/no-op revisions.

Apply both feature migrations, deploy compatible code, opt the existing OAuth client into the optional scope explicitly, then refresh tools and publish the updated skill through the existing process. This PR performs none of those live mutations. Existing workspace role/tool approval may need review for the new mutating tool; do not replace the App or broaden its audience.

Acceptance must verify actual ChatGPT inline rendering, model-hidden metadata, app-only visibility, explicit click, optional OAuth consent, stored receipt and real account isolation. Native provider tests and synthetic browser checks do not replace those host checks.
