# LiveStocks branded connection candidate

Status: **not ready to replace the existing ChatGPT App**.

Created with explicit user authorization on 2026-11-16 through Plugin Creator:
- Private workspace plugin: [LiveStocks](https://chatgpt.com/plugins/Plugin_89d695426d24819181960d8188dc9a9a)
- Release: `pluginrel_6afb6a466fbc8191ae5df1bdaa002eb7`, version `1.2.0`.
- The original App-backed plugin remains active and unchanged.

The skill matches the original cloud 1.2.0 skill byte-for-byte. This package points to the same production MCP endpoint, so it does not deploy a second backend or copy portfolio data. The composer icon matches the website PNG. No credentials are included.

Actual ChatGPT verification showed **Open in desktop app**, one MCP server and one skill, with a generic header icon. Package ingestion alone therefore did not meet the requested ChatGPT connection/icon outcome. Do not present this candidate as the working replacement or create it again.

The supported ChatGPT **Add custom MCP server** form exposes a separate icon upload (PNG, max 10 KB), OAuth setup, and connection creation. The user enabled Chrome extension file-URL access. Website `apple-touch-icon.png` was successfully selected through the supported file chooser; the ChatGPT form confirms its filename. This is a prepared form, not a saved App/avatar verification. OAuth client ID and client secret remain empty. The prepared form discovered all three portfolio scopes, the original callback URL and production endpoints; token endpoint auth is configured as `client_secret_post`. User-defined OAuth credentials are required (the server does not advertise DCR or CIMD). Enter these directly in the provider form, not chat or package files. Complete that App flow, then attach the updated skill through its canonical plugin and verify all 16 tools plus authentication before any migration away from the original connection.

The production OAuth discovery was checked live: read, screenshot sync and executed-transaction scopes are advertised. This confirms discovery only, not a new grant or a working new App. Do not enable DCR, anonymous access, or widen an existing grant to bypass setup.
