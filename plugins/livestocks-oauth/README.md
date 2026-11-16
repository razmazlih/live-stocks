# LiveStocks

Retained source for the user-approved RABEN workspace [LiveStocks plugin](https://chatgpt.com/plugins/plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b). This is the sole installed LiveStocks connection after the user-approved legacy-plugin uninstall. The old `plugins/livestocks` source and owned cloud artifact are retained; uninstall did not permanently delete them.

The published App-backed package version is `1.1.1`. `.app.json` binds the new App; `plugin.json` is the Agent Plugins manifest and `.codex-plugin/plugin.json` preserves the OpenAI overlay. The full analyst skill requires an authenticated profile before personal portfolio research and keeps the original full-sale/new-stock-only recommendation rules. It does not execute transactions.

Use Plugin Creator's expected-release update workflow to change skill files. Preserve the existing App binding, metadata and RABEN WORKSPACE/LISTED audience. OAuth client credentials belong in the host's owning connection settings, never in this package. Read the [activation evidence and checklist](../../docs/CHATGPT_ACTIVATION.md) before changing the connection.

The README is repository documentation; the published archive contains the two manifests, `.app.json`, the skill file and the two approved PNG icon assets.

## Public-release preparation

The [separate public candidate](../livestocks/PUBLIC_RELEASE.md) now targets this active OAuth source while retaining the approved LiveStocks brand. The public manifest/portable MCP draft lives at the historical preparation path, without private App bindings. Live connectivity passed, but publisher/country decisions, secure Google reviewer fixtures, a real accessible demo and the saved-submission case suite remain incomplete. No public ZIP, upload or submission has been produced. Physical installation of the latest Scriptable widget source is also unverified.

The owner renamed this existing OAuth App to **LiveStocks** through its owning settings. App/plugin IDs, connected OAuth account and analyst skill were preserved. The later workspace-listing change below is separate from the rename. Repository manifests mirror the authoritative cloud readback; this is a display-name update, not a new connection.

## Displayed icon verification

The server now advertises the existing 180px website PNG at `/brand/apple-touch-icon.png` through `initialize.serverInfo.icons` and `server/discover._meta["io.modelcontextprotocol/serverInfo"].icons`, with the title **LiveStocks**. The asset URL uses the configured canonical origin, not the request Host.

Production deployment `dpl_3okGaXimbjkVwvqBkXcFawWJstLx` was promoted after build, typecheck, focused MCP tests, public discovery/icon and authentication-boundary checks. The connected `get_profile` still succeeded afterward.

**Earlier metadata-only attempt did not change the avatar.** One existing-App **Refresh tools** action and a browser reload retained the generic multicolor icon; settings expose name/description edits but no observed icon editor. The name **LiveStocks**, App/plugin identity, OAuth connection and skill remain intact. Server icon metadata is not proof that a hosted App's registered logo changed. OpenAI's [MCP extensions specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) distinguishes hosted registered App logos from server icons. No replacement App or permission change was made by the icon update. See [sanitized branding evidence](../../docs/verification/chatgpt-branding-2026-11-15.json).

A subsequent user-authorized, expected-release-guarded update attempted to add the approved composer/logo PNGs directly to this same private package. Plugin Creator rejected it with HTTP400 `INVALID_ARGUMENT`: App-backed updates must preserve App presentation and use the owning App controls to change it. Readback confirmed unchanged release `pluginrel_6af9b6cc71008191a30dc689a0af9a58`, version1.1.0, no new assets/icon references, and unchanged PRIVATE scope. This records the earlier Plugin Creator endpoint limitation. After the same plugin became workspace-owned, the supported Admin Console upload path accepted the icon update described below; no hidden endpoint or replacement plugin was used.

## RABEN workspace publication

**Published to the RABEN workspace directory on 2026-11-15**, preserving this exact App/plugin and release. The supported route was the existing plugin's **More actions → Share → Link access → Visible in RABEN directory → Save**, with explicit action-time approval. Authoritative sharing and metadata readbacks confirmed `WORKSPACE` / `LISTED` for RABEN, the same plugin ID and release `pluginrel_6af9b6cc71008191a30dc689a0af9a58`, and version `1.1.0`. The connected `get_profile` succeeded afterward. Each member still authenticates their own LiveStocks account; listing does not grant access to the owner's portfolio.

The earlier legacy App **Publish** flow remained pending without an error. The workspace-credit banner was not established as its cause, and billing was not changed. The working alternative above resolved workspace publication without another plugin, archive upload, or individual-user invitation. After Save the user switched Safari tabs, so confirmation used authoritative connector readbacks rather than a fresh catalog screenshot.

This is workspace listing, **not global public-directory publication**. The user subsequently limited the task to RABEN; no public submission was made. [Verification evidence](../../docs/verification/chatgpt-branding-2026-11-15.json) retains the earlier failed observations and the final successful result.

## Accepted workspace icon package

After explicit approval to upload the complete six-file package, **RABEN Admin Console → this exact plugin → Plugin actions → Upload new version** accepted version `1.1.1`, release `pluginrel_6af9cef9c9d4819186ac76a2a7a20eb4`. Cloud readback includes the approved website composer PNG and 512px logo plus their manifest references. The App binding and complete analyst skill are byte-identical to their pre-update versions. OAuth `get_profile` still succeeds, and the same plugin remains `WORKSPACE` / `LISTED` in RABEN.

**The user visually confirmed that the website icon is now displayed:** “אני כבר רואה את אייקון האתר”. This completes the requested existing-plugin icon change. The assistant did not capture an additional screenshot after upload; the rendering evidence is the user’s explicit confirmation.

The fresh workspace admin catalog also showed **Unavailable / disabled** and requested **Review app** for tool and role approval. Directory listing and approval for other members are separate. No role/access approval was changed as part of this cosmetic update.


## In-chat screenshot synchronization source

The pending source change adds an inline MCP App review and final confirmation inside ChatGPT; no website handoff is needed. A separately consented optional portfolio:sync scope permits only exact persisted RECONCILE proposals. Existing tokens stay read-only, general portfolio writes remain denied, and confirm/cancel are app-only with a model-hidden capability. Corrections invalidate old cards and receipts are replay-safe.

The screenshot-sync skill was published as version **1.1.3** on 2026-11-16, preserving the existing App/plugin IDs and workspace audience. The existing OAuth client now optionally allows `portfolio:sync`; existing grants remain read-only until the user explicitly consents in ChatGPT. Refresh the existing App tools after the server release. See [screenshot-sync accounting/security](../../docs/SCREENSHOT_SYNC.md) and [activation requirements](../../docs/CHATGPT_ACTIVATION.md).

## Configurable investment sources

The local source now discovers each user's investment sources from `get_portfolio_snapshot.sources`. Screenshot synchronization passes the selected active source UUID as `location` and shows its actual name in the review card. A single active source is selected automatically; multiple ambiguous sources require one clarification by name. Source creation and renaming remain website actions. Source-catalog guidance was published as workspace plugin **1.1.2**, release `pluginrel_6afac82680cc8191bf9db8c8c7bab7b0`, and read back. The partial update preserved the App, workspace, audience, assets and existing research instructions. Only the source-catalog section was added to the remote research skill; the separate local screenshot-sync draft section above was not included in that package update.
