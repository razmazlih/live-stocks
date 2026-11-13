# LiveStocks

The single active LiveStocks plugin uses a private cloud App connection to the existing application. No new website or local MCP process is needed.

![LiveStocks site icon](../../public/brand/apple-touch-icon.png)

![Installed LiveStocks cloud plugin with the site icon and research skill](assets/plugin-chatgpt.jpg)

- Display name: **LiveStocks**.
- Plugin: [Open LiveStocks](https://chatgpt.com/plugins/plugin_asdk_app_6af6d6f889a88191ae50abfc0070421b).
- App ID: `asdk_app_6af6d6f889a88191ae50abfc0070421b`.
- MCP endpoint: `https://razmaz-live-stocks.vercel.app/api/mcp`.
- Skill release: `1.0.1`.
- Icon: the existing `public/brand/apple-touch-icon.png`, uploaded during the custom MCP connection setup.

## Use

In ChatGPT, use the same account, start a new Chat or Work conversation, and select **LiveStocks** with `@`. Ask it to read the portfolio or analyze investment opportunities. Personalized allocations require a confirmed free-cash budget, investment horizon and risk tolerance.

Tools: `get_research_brief`, `get_portfolio_snapshot`, `get_market_quotes`, `validate_action_plan`. The research skill requires current external sources and permits only a BUY of an unowned stock, a full SELL across all accounts, or no action. There is no order execution or portfolio write tool.

## Why this uses an App binding

An archive with an MCP declaration can be classified as desktop-only, even with a remote HTTPS endpoint. This was observed in the original plugin's actual ChatGPT web listing. The supported cloud setup is **Plugins → Add → Add custom MCP server**, with this existing endpoint. This creates the App-backed plugin represented by `.app.json`.

Preserve the exact App binding and App-owned presentation. Do not add `mcp.json` or `.mcp.json` to this package or recreate the obsolete desktop package. Edit App name/connection metadata through the App's own controls. Update skills through Plugin Creator using the existing plugin ID and its current release ID; read back the saved files. The legacy compatibility manifest is retained to preserve generated App metadata, including its null default prompt.

The supported custom-connection creation screen includes a PNG icon chooser (10 KB maximum). During this setup, no icon-edit control was available for an existing private custom App, so a user-approved branded replacement was created before removing the old registrations.

## Verification and access

On 2026-11-13, the final branded **LiveStocks** plugin read all seven recorded holdings through `get_portfolio_snapshot` in a real ChatGPT web conversation. The user separately confirmed that the final plugin's name and blue site icon appeared and that a fresh portfolio read succeeded in the ChatGPT phone app. This verifies the cloud path rather than relying only on direct HTTP tests or a narrow browser viewport. No transactions or portfolio updates were performed.

The obsolete desktop plugin `Plugin_343a85d949448191914aa200da67b364` was uninstalled and deleted; a metadata lookup returned `NOT_FOUND`. The first unbranded cloud connection, `plugin_asdk_app_6af6d33c4e6881919e385643f9d350ad`, was renamed **LiveStocks Previous** and uninstalled. Its **Delete app** and **Delete plugin** operations returned ChatGPT errors, including after uninstall/reload. Its inactive account registration therefore remains; do not report it as deleted. Only the final branded plugin is installed. This is a platform cleanup limitation, not a portfolio-data or server deletion.

Further diagnosis on the same date identified the exact backend error for both normal UI deletion paths: HTTP `409 Conflict`, `apps_sdk_error`, `App plugin contains independently managed content.` A guarded Plugin Creator cleanup removed the retired plugin's research skill and manifest reference (v1.0.2); read-back confirmed only `.app.json` and its compatibility manifest remain. Both deletion paths still return the same 409. The active plugin remains v1.0.1 with its research skill intact. At the owner's explicit request, the full [support diagnostic](../../docs/livestocks-plugin-delete-support.txt) was sent through the OpenAI Help Center on 2026-11-13, with instructions to delete only the retired registration and preserve the active plugin. The support chat confirmed escalation to a support specialist and said replies would also arrive by email in the coming days. No case number was displayed; deletion is still pending.

The endpoint inherits the existing application's anonymous **shared portfolio** access model, not a separate per-user portfolio. A private plugin does not protect the public API. No provider credentials are packaged or returned. Do not share this as a multi-user portfolio service.

The snapshot's existing five-minute cache can serve older data during revalidation/outages. `generatedAt` is not quote time. Null prices/FX remain unavailable. Action validation blocks snapshots older than 15 minutes and checks recorded holdings and arithmetic only; ticker aliases, suitability and trade-price freshness require separate verification. Candidate quotes have a five-second per-symbol response deadline; existing shared provider work may finish later.

Market news, historical prices and fundamentals come from the host's available research tools, not this server. Without sufficient current evidence, the skill withholds unsupported recommendations.

See the official [desktop-only package limitation](https://learn.chatgpt.com/docs/enterprise/plugin-management#desktop-only-plugins) and [custom MCP setup](https://developers.openai.com/plugins/deploy/connect-chatgpt).
