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

Required public website, support, privacy-policy and terms URLs must be created/verified before packaging. The authenticated portfolio page does not fulfill a public listing page. Support contact, data-retention/deletion policy and publisher identity need owner-supplied facts; no policy commitments have been invented here.

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

1. Pass real Auth0 issuance/refresh/resource tests, literal database-role acceptance, direct REST/RLS isolation, revocation and ChatGPT connection checks. Finish the guarded production/preview environment setup.
2. Collect the actual publisher/countries/support/policy decisions and verify all four public URLs without login. Confirm the listing and prompts with the owner.
3. Create a **separate public-upload copy**. Keep the private source `.app.json` binding intact; the author-supplied public bundle must omit `.app.json` and non-null `apps` declarations, and declare the verified OAuth MCP server portably.
4. Put the five positive/three negative cases in the exact supported review metadata fields; supply a real accessible demo recording and secure reviewer access. Validate the actual ZIP inventory and icon sizes.
5. Treat draft upload, submission for review and publication as distinct outcomes. The authorized owner completes legal attestations. No approval or public availability is claimed by preparing this source.

Packaging is deliberately pending until the authenticated server and required publication facts are verified. No duplicate private plugin has been created.
