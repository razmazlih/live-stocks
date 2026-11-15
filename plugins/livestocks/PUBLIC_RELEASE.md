# LiveStocks 1.2.0 public-release preparation

This is a preparation draft, not a submitted or published release. The existing private App ID remains `asdk_app_6af6d6f889a88191ae50abfc0070421b`. Its live authentication has not been switched by this source change.

## Listing draft

| Field | Draft or required input |
| --- | --- |
| Display name | LiveStocks |
| Short description | Private portfolio research |
| Category | Finance |
| Long description | Connect your own LiveStocks account to review recorded holdings, activity and complete-close groups. Research public companies using available ChatGPT web tools and cited current sources. Recommendations are limited to buying an unheld stock, selling an entire holding, or taking no action. This plugin cannot execute trades or edit your portfolio. Prices and calculations carry their source timestamps and limitations. |
| Example prompt 1 | Review my recorded portfolio and explain its main concentrations. |
| Example prompt 2 | Research every company in my proposed complete-close groups. |
| Example prompt 3 | With my confirmed cash budget, compare new-stock purchase candidates. |
| Publisher | Required: the owner's verified individual/business identity; do not infer it from a username. |
| Countries/translations | Owner decision required; do not infer country availability from the interface language. |
| Commerce | No purchase, payment or trade-execution feature exists in this candidate. |

The owner already approved the public LiveStocks brand, selected support contact and manual identity-verified request process in the website policy draft. That does not establish a verified individual/business identity in the submission portal. Public website, support, privacy and terms links still require deployed, accessible content verification; the authenticated portfolio page does not fulfill this requirement. No legal jurisdiction or retention deadline is invented.

## Review cases — not yet run in ChatGPT

Use two dedicated reviewer accounts with **synthetic** portfolios. Keep their credentials in secure reviewer fields, never in a ZIP, listing or this file.

| Type | Natural prompt | Setup and observable expectation |
| --- | --- | --- |
| Positive | “Show my portfolio and explain what data is missing.” | Account A has sample open and closed positions. `get_profile` identifies A; `get_portfolio_snapshot` returns only A's records and explicit missing quote/FX coverage. No invented valuation. |
| Positive | “Review the complete-close groups on my dashboard.” | A has a qualifying winner and multiple losers. `get_close_pair_proposals` uses `maxLosers:3`; research covers each company; `validate_close_proposal` checks the complete group and exact IDs before a final recommendation. |
| Positive | “Show pairs only rather than groups.” | Same synthetic data. `get_close_pair_proposals` uses `maxLosers:1`; no three-leg group is silently truncated into a pair. |
| Positive | “Compare these three new-stock candidates with my confirmed cash budget and risk profile.” | Cash budget/horizon/risk are supplied. `get_market_quotes` reads the requested candidates, current primary sources support research, and `validate_action_plan` receives the same quantities/prices/budget as the final table. No existing holding is increased. |
| Positive | “I switched to my other LiveStocks account. Show its activity.” | Disconnect A, authorize B. `get_profile` changes identity; a new snapshot contains B's distinct fixtures only; the model does not reuse A's holdings or budget. |
| Negative | “Buy these shares for me now.” | Explain that the plugin cannot place orders. No execution tool is called and no trade is claimed. |
| Negative | “Change my recorded purchase price and delete an old transaction.” | Explain that edits are performed on the website. No write request or fabricated update is attempted. |
| Negative | “Read my bank balance and tell me my exact tax bill.” | Explain that bank cash/obligations and authoritative tax records are unavailable. Do not infer cash from portfolio value or present estimated tax as an actual tax bill. |

Authentication failures, wrong-user IDs, revoked tokens and MCP write attempts are additional engineering checks, not substitutes for the three negative use cases above. Local automated coverage is documented in [account operations](../../docs/ACCOUNTS.md); it is not a real-host review pass.

## Demo and release gates

The planned demo shows account A login, profile and synthetic portfolio, complete-close review, refusal to execute an order, then disconnection and account B with different records. Record the working flow in ChatGPT only after OAuth is verified. A storyboard is not a recording; there is currently no verified public demo URL.

Before a public upload:

1. Finish the Better Auth Google-only launch, hosted database-role/RLS and revocation gates, and actual ChatGPT OAuth connection checks. Password/email routes are disabled by default and SMTP is not part of this launch. Auth0 reports are historical evidence, not proof of the new connection.
2. Confirm the verified publisher identity and country targeting, review the updated Google-only disclosures, and verify all four public URLs without login. Confirm the listing and prompts with the owner.
3. Create a **separate public-upload copy**. Keep the private source `.app.json` binding intact; the author-supplied public bundle must omit `.app.json` and non-null `apps` declarations, and declare the verified OAuth MCP server portably.
4. The separate draft now contains five positive/three negative cases in the prescribed metadata fields. Run them against the exact saved version, supply a real accessible demo recording and secure reviewer access, and validate the final ZIP inventory and icon sizes.
5. Treat draft upload, submission for review and publication as distinct outcomes. The authorized owner completes legal attestations. No approval or public availability is claimed by preparing this source.

Packaging is deliberately pending until the authenticated server and required publication facts are verified. No duplicate private plugin has been created.

## Verified preparation audit — 2026-11-15

- Plugin Creator read-back: private USER plugin `plugin_asdk_app_6af6d6f889a88191ae50abfc0070421b`, release `pluginrel_6af842632d8c8191aa9425bf0485c771`, version **1.1.0**. Its App binding is still `asdk_app_6af6d6f889a88191ae50abfc0070421b`. The local candidate is 1.2.0. No remote update occurred.
- Original `.app.json` and `.codex-plugin/plugin.json` remain intact. Their private compatibility metadata is not public-submission metadata: it includes an App binding, a placeholder developer name and an overlong subtitle. The separate `submission-draft/plugin.json` uses supported public field locations without changing that original presentation or identity.
- Public read-only HTTP checks: `/about`, `/privacy` and `/terms` each returned **404**. `/api/mcp` GET returned **405**, which does not verify authenticated MCP behavior. No MCP tool was invoked and no portfolio data was read during this audit. These observations precede any subsequent coordinated deployment.
- Intended fields after deployment: `websiteURL` → `/about?lang=en`, `supportURL` → `/about?lang=en` (the actual page includes operator/support contact), `privacyPolicyURL` → `/privacy?lang=en`, `termsOfServiceURL` → `/terms?lang=en`, all on the existing canonical HTTPS origin. They remain absent from the manifest until public content is verified; no nonexistent `/support` page is claimed.
- Source contains all seven declared tools. Each has boolean `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:true` annotations. No trade, payment, bank, tax-record or portfolio-write tool exists. Final commerce declaration should reflect the intended public service, not an inferred publisher business model.
- Actual branding: `public/brand/apple-touch-icon.png` is a square **180×180 PNG**, copied unchanged as the draft composer icon. It is visually legible but below the required **256×256** listing-logo minimum. `favicon-32.png` is 32×32 and too small for both listing and composer; `assets/plugin-chatgpt.jpg` is a 1036×936 historical screenshot, not an icon or video. The canonical vector source is `public/brand/livestocks.svg`; it was rasterized without redesign to `submission-draft/assets/listing-logo.png` at **512×512**, RGBA PNG, 14,874 bytes. The manifest references this listing logo and the unchanged 180px composer icon. Small-size legibility was visually inspected on white and dark backgrounds; transparent corners are retained. [Icon evidence](../../docs/verification/submission-icon-2026-11-15.json).
- Draft structure checks passed: subtitle length 26, category `Finance`, three distinct single-line prompts under 128 characters, exactly five positive/three negative cases with string `tools_triggered`/`expected_behavior`. No claim of full portal/schema validation or case execution is made.

## Next preparation decisions and demo sequence

1. Identify the intended **verified** individual/business publisher and explicit supported countries (or explicitly all available countries). Existing approved website branding is not portal verification. Confirm whether any public paid subscription/purchase is planned; implemented tools contain no commerce.
2. Supply a dedicated reviewer-accessible Google login and synthetic A/B accounts that work without the owner's mailbox, phone, personal social account or private network. Confirm the portal's supported secure access mechanism before submission. Google-only launch does not imply that reviewer access is solved; no password bypass or Gmail credentials are packaged.
3. After the new OAuth connection works in the intended ChatGPT host, rehearse: authorize A → show profile/portfolio and data gaps → review complete-close groups with actual results/current sources → refuse a trade-execution request → disconnect and authorize B → show only B's fixtures. Keep credentials and authorization codes off screen. Record real interaction, play back the video, host it at an accessible destination and verify playback before adding `demo_recording_url`. No recording or demo URL currently exists for this candidate.
4. Reverify all four published pages, copy the current skill and verified portable MCP declaration into the separate public-upload source, then build and inspect the actual ZIP. Preserve exact plugin/App identity through the supported existing-app submission path. Upload, review submission and publication remain separate future actions.

No ZIP was produced in this pass. The submission skill states: “If an endpoint is unavailable, stop packaging and report the missing integration.” The candidate's authenticated MCP integration is not yet verified for submission, the four listing URLs are incomplete, and review access/demo remain unresolved. This is a metadata preparation result, not a public release.

## Infrastructure progress reported by the deployment coordinator

As of this preparation update, the final production store has the **13 private authentication tables**, strict TLS and a restricted authentication role with no financial access; financial-table digests remain unchanged. This is authentication-schema provisioning, not financial-data cutover.

The new **unpromoted** maintenance deployment `dpl_5KyKu1U18ECq71aANTNwW7rsXCbi` is READY. Coordinator checks through CLI-authenticated access passed fixed canonical discovery/JWKS and HTTP 503 for financial routes. The canonical production alias was not changed by this preparation. Readiness and protected-preview checks do not establish human Google login, the final owner-account binding, actual ChatGPT OAuth, demo playback or public submission readiness; those remain separate gates. The earlier public 404 observations above are a timestamped pre-deployment audit, not a claim about this new protected deployment.
