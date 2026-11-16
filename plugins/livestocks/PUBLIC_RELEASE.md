## Confirmed publication choices — 2026-11-16

The owner explicitly selected **all available countries** and **free use**. The public manifest encodes unrestricted country targeting as `publication.countries: []`; this is intentional, not an unknown value. Free use must be reflected truthfully in the portal commerce declaration once its exact field format is verified. Publisher identity remains unanswered. Older pending-country and pending-pricing statements below are superseded by this confirmation. No submission or public publication has occurred.

# Current public preparation — 2026-11-16

Live Plugin Creator readback confirms the existing plugin is WORKSPACE / LISTED in RABEN, version **1.1.3**, release `pluginrel_6afad5c0a2c081919623d0a838fec5ff`. This is not global public publication. The owner now requests public publication; earlier RABEN-only scope is superseded.

The 1.2.0 public manifest draft now describes optional screenshot reconciliation and separate consent accurately, adds a sixth positive review case for human confirmation/cancellation, and narrows the unsupported-write negative case to arbitrary transaction editing. No public upload or submission was made. The installed package still has historical read-only presentation; this draft does not change it.

The sections below are historical preparation evidence. Their 1.1.0 source, seven-tools-only and no-portfolio-write statements are superseded by the current source and screenshot-sync documentation. Screenshot preparation stores a draft, confirmation modifies exact recorded holdings and cancellation changes proposal status; their annotations must not be represented as universally read-only. See [current source](../livestocks-oauth/README.md) and [screenshot-sync evidence](../../docs/SCREENSHOT_SYNC.md).

Still needed: the owner's intended verified publisher, explicit countries and commerce decision; secure dedicated reviewer access and fixtures; a real hosted demo including screenshot confirmation/cancellation; policy coverage for this behavior; and tests/scans/attestations on the exact saved portal version. Current web-tool rechecks of the three public pages returned access errors, so the older successful URL checks below are not a fresh verification. Do not claim a submission-ready ZIP. Final packaging must use the authoritative current skill, exclude private bindings and preserve the existing installed plugin.

---

# LiveStocks public-release preparation

**Preparation only: no public ZIP, upload, submission or publication.** Public candidate **1.2.0** is based on the active private **LiveStocks (OAuth) 1.1.0**, not the retired unauthenticated App. The public listing retains the approved LiveStocks brand; no private presentation or binding was changed by this draft.

## Active source and completed evidence

| Item | Verified state |
| --- | --- |
| Active App | `asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b` |
| Active plugin | `plugin_asdk_app_6af9b5f79fe48191a12eaa9c67d6ae7b` — USER / PRIVATE |
| Current private release | `pluginrel_6af9b6cc71008191a30dc689a0af9a58`, version `1.1.0` |
| Retained current source | [`../livestocks-oauth`](../livestocks-oauth/README.md) |
| Legacy state | Old plugin uninstalled with explicit approval; owned cloud artifact and source retained |
| Live host checks | Google/consent connection, profile and portfolio reads, pinned canonical owner match, refresh after five-minute lifetime, revocation challenge/no data, fresh approval and same-profile reconnect passed |
| Tools | `get_profile`, `get_research_brief`, `get_portfolio_snapshot`, `get_close_pair_proposals`, `validate_close_proposal`, `get_market_quotes`, `validate_action_plan` |

[Actual host evidence](../../docs/verification/chatgpt-oauth-activation-2026-11-15.json) distinguishes an internally handled host authentication challenge from a directly observed HTTP401. Neither that lifecycle test nor automated tenant isolation proves all research/reviewer scenarios below. Hosted isolation, production rollout and financial integrity evidence are maintained separately in the account documentation. Auth0 setup reports and the old four-tool package are historical, not current public integration evidence.

All seven tools have boolean `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:true`. They cannot place trades, edit portfolios, retrieve bank balances or establish exact tax liability. Price timestamps, coverage gaps and validation limits remain part of the response.

## Prepared listing and portable integration

The [separate manifest](submission-draft/plugin.json) uses the new source's package name and public candidate version 1.2.0. It contains the approved LiveStocks brand, Finance category, 26-character subtitle “Private portfolio research”, three starting prompts, five positive and three negative review cases, and truthful release notes. Unknown publisher, country, translation, commerce and recording declarations are absent rather than invented.

Anonymous live checks on 2026-11-15 returned HTTP200 and substantive matching content for all four required fields:

| Field | Verified page and content |
| --- | --- |
| websiteURL | [About](https://razmaz-live-stocks.vercel.app/about?lang=en): purpose, Google-only account connection, read-only ChatGPT, market-data limitations |
| supportURL | [About/support](https://razmaz-live-stocks.vercel.app/about?lang=en): operator identity and contact method; no support-message delivery was tested |
| privacyPolicyURL | [Privacy](https://razmaz-live-stocks.vercel.app/privacy?lang=en): account/portfolio processing, encrypted Finnhub key, hashed widget keys, provider/host sharing, manual requests and retention limitations |
| termsOfServiceURL | [Terms](https://razmaz-live-stocks.vercel.app/terms?lang=en): no brokerage execution, user responsibilities, revocable connections and service limits |

The previous pre-deployment 404 observations are superseded by this public content check. The published policy's existence does not establish portal developer verification or legal-review completion.

[Portable mcp.json](submission-draft/mcp.json) declares only the verified `https://razmaz-live-stocks.vercel.app/api/mcp` Streamable HTTP endpoint. Its OAuth issuer is `https://razmaz-live-stocks.vercel.app/api/auth`; read scope is `portfolio:read`. The private ChatGPT registration uses `client_secret_post`, S256 PKCE, consent and the observed callback `https://chatgpt.com/connector_platform_oauth_redirect`. Do not assume a future portal callback/client registration is identical, embed its secret, weaken server checks or enable DCR for submission. Inspect the saved portal connection when that stage is authorized.

The separate icons preserve the approved vector/PNG brand: 180×180 composer PNG and 512×512 listing-logo PNG, both below 5 MiB. Earlier light/dark visual checks are recorded in [icon evidence](../../docs/verification/submission-icon-2026-11-15.json); no new icon was generated.

## Public review scenarios — not run as a saved-submission suite

Use dedicated reviewer-accessible Google identities and **synthetic** portfolios, never the owner's real portfolio or social account. Store access instructions/secrets only in the secure reviewer fields.

| Type | Natural prompt | Observable expectation |
| --- | --- | --- |
| Positive | Show my portfolio and explain what data is missing. | Account A fixtures contain open/closed positions and a missing quote; profile/snapshot are account-bound and coverage gaps are stated without inventing valuation. Owner connectivity passed, but this fixture scenario remains not run. |
| Positive | Review the complete-close groups on my dashboard. | Qualifying synthetic winner plus multiple losers; `maxLosers:3`, research every member using current opened sources, validate exact snapshot/proposal before recommending. Not run. |
| Positive | Show pairs only rather than groups. | `maxLosers:1`; use its actual fingerprint rather than truncating a larger group. Not run. |
| Positive | Compare these three new-stock candidates with my confirmed cash budget and risk profile. | Confirm budget/horizon/risk; read requested quotes, cite primary sources, validate exact quantities/prices/budget; no adding to an owned stock. Not run. |
| Positive | I switched to my other LiveStocks account. Show its activity. | Authorize reviewer B; changed profile and only B fixtures; discard A holdings/budget. Two-human/reviewer-account host case not run. |
| Negative | Buy these shares for me now. | Explain no execution; no tool invoked as an order, no trade claimed. Not run. |
| Negative | Change my recorded purchase price and delete an old transaction. | Explain edits belong on the website; no write or fabricated update. Not run. |
| Negative | Read my bank balance and tell me my exact tax bill. | Explain unavailable data; no portfolio-value cash inference or exact tax claim. Not run. |

## Remaining preparation, in order

1. Select the intended verified individual/business publisher and explicit countries (or explicitly all available countries). Confirm whether public subscriptions/purchases are planned; implemented tools have no commerce. Existing site branding and Free hosting plans do not answer these publication questions.
2. Establish dedicated Google reviewer access and fixtures that work without the owner's mailbox, phone, personal account or private network. Confirm the portal's supported secure access mechanism; do not introduce a password bypass or expect reviewers to create their own fixture accounts.
3. Rehearse and record a real ChatGPT walkthrough: authorize A → profile/portfolio and gaps → complete-close research/validation → refuse execution → disconnect → authorize B → only B fixtures. Keep credentials, authorization codes and real holdings off screen. Play back the actual file, host it with reviewer access and verify its URL before populating `demo_recording_url`. A storyboard is not a recording.
4. Finalize a separate public upload from the active OAuth skill. Omit root `.app.json`, compatibility files with private bindings, and every non-null `apps` declaration. Include the portable MCP declaration, icons, finalized metadata and byte-identical current skill. Validate file inventory, lengths, schema and cases before creating the final ZIP. Preserve the existing private source; do not silently create another private App.
5. Only after preparation and authorization, upload a draft into the intended publisher organization, inspect its imported metadata, connect/test the exact saved server version and resolve scans/reviewer requirements. Preserve Portal-generated bindings in finalized releases. The authorized developer completes legal attestations. Upload, submission for review and public publication remain separate outcomes.

**Still unverified outside plugin submission:** physical installation/execution of the latest Scriptable widget source on the user's iPhone. Production widget API/auth/revocation tests and local source simulations do not prove that device installation. See the widget installation documentation; do not include a physical-device success claim in the demo or listing.

No new cloud object, ZIP, upload, submission, recording or public publication was produced during this final preparation update.
