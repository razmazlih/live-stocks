# LiveStocks (OAuth)

Retained source for the user-approved private [LiveStocks OAuth plugin](https://chatgpt.com/plugins/plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b). The old `plugins/livestocks` package and old cloud App are preserved.

The published App-backed package version is `1.1.0`. `.app.json` binds the new App; `plugin.json` is the Agent Plugins manifest and `.codex-plugin/plugin.json` preserves the OpenAI overlay. The full analyst skill requires an authenticated profile before personal portfolio research and keeps the original full-sale/new-stock-only recommendation rules. It does not execute transactions.

Use Plugin Creator's expected-release update workflow to change skill files. Preserve the existing App binding, metadata and PRIVATE visibility. OAuth client credentials belong in the host's owning connection settings, never in this package. Read the [activation evidence and checklist](../../docs/CHATGPT_ACTIVATION.md) before changing the connection.

The README is repository documentation; the published archive contains the two manifests, `.app.json` and the skill file only.
