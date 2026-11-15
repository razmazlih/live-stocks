# LiveStocks

Retained source for the user-approved private [LiveStocks plugin](https://chatgpt.com/plugins/plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b). This is the sole installed LiveStocks connection after the user-approved legacy-plugin uninstall. The old `plugins/livestocks` source and owned cloud artifact are retained; uninstall did not permanently delete them.

The published App-backed package version is `1.1.0`. `.app.json` binds the new App; `plugin.json` is the Agent Plugins manifest and `.codex-plugin/plugin.json` preserves the OpenAI overlay. The full analyst skill requires an authenticated profile before personal portfolio research and keeps the original full-sale/new-stock-only recommendation rules. It does not execute transactions.

Use Plugin Creator's expected-release update workflow to change skill files. Preserve the existing App binding, metadata and PRIVATE visibility. OAuth client credentials belong in the host's owning connection settings, never in this package. Read the [activation evidence and checklist](../../docs/CHATGPT_ACTIVATION.md) before changing the connection.

The README is repository documentation; the published archive contains the two manifests, `.app.json` and the skill file only.

## Public-release preparation

The [separate public candidate](../livestocks/PUBLIC_RELEASE.md) now targets this active OAuth source while retaining the approved LiveStocks brand. The public manifest/portable MCP draft lives at the historical preparation path, without private App bindings. Live connectivity passed, but publisher/country decisions, secure Google reviewer fixtures, a real accessible demo and the saved-submission case suite remain incomplete. No public ZIP, upload or submission has been produced. Physical installation of the latest Scriptable widget source is also unverified.

The owner renamed this existing OAuth App to **LiveStocks** through its owning settings. App/plugin IDs, PRIVATE visibility, connected OAuth account and analyst skill remain the same. Repository manifests mirror the authoritative cloud readback; this is a display-name update, not a new connection.

## Displayed icon verification

The server now advertises the existing 180px website PNG at `/brand/apple-touch-icon.png` through `initialize.serverInfo.icons` and `server/discover._meta["io.modelcontextprotocol/serverInfo"].icons`, with the title **LiveStocks**. The asset URL uses the configured canonical origin, not the request Host.

Production deployment `dpl_3okGaXimbjkVwvqBkXcFawWJstLx` was promoted after build, typecheck, focused MCP tests, public discovery/icon and authentication-boundary checks. The connected `get_profile` still succeeded afterward.

**Actual ChatGPT avatar remains unchanged.** One existing-App **Refresh tools** action and a browser reload retained the generic multicolor icon; settings expose name/description edits but no observed icon editor. The name **LiveStocks**, App/plugin identity, OAuth connection and skill remain intact. Server icon metadata is not proof that a hosted App's registered logo changed. OpenAI's [MCP extensions specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) distinguishes hosted registered App logos from server icons. No replacement App or permission change was made. See [sanitized branding evidence](../../docs/verification/chatgpt-branding-2026-11-15.json).

A subsequent user-authorized, expected-release-guarded update attempted to add the approved composer/logo PNGs directly to this same private package. Plugin Creator rejected it with HTTP400 `INVALID_ARGUMENT`: App-backed updates must preserve App presentation and use the owning App controls to change it. Readback confirmed unchanged release `pluginrel_6af9b6cc71008191a30dc689a0af9a58`, version1.1.0, no new assets/icon references, and unchanged PRIVATE scope. This is an observed backend limitation, not a claim that the icon was updated. No alternate hidden endpoint or replacement plugin was used.

The user's separate RABEN workspace-publish attempt was inspected read-only: the legacy Apps inventory remained loading, the supported Admin Console workspace catalog showed **No plugins found**, and a freshly reloaded App still showed **DEVELOPMENT**. Publication is therefore unconfirmed. A workspace-credit warning was visible, but no evidence established it as the cause; billing was not changed and Publish was not retried. This does not affect the working personal OAuth connection.
