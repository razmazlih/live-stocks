# Reviewer account preparation

Status: preparation only. No Google identity or LiveStocks reviewer account has been created. No reviewer login, credentials, fixture write or public submission has been verified.

## Identity and access

Use a dedicated test Google identity with no personal portfolio or unrelated personal content. The owner creates it and signs in to the existing LiveStocks website through `/sign-in`. Do not reuse the owner account or enable a reviewer authentication bypass. Local source supports Google; password login is separately gated and must not be assumed enabled in production.

Before submission, verify that reviewers can sign in independently without the owner’s mailbox, phone, social account or private network. A fresh Google identity alone does not prove this. Put login instructions and credentials only in the secure portal fields, never Git, this package or chat. If Google challenges prevent independent access, resolve an officially supported reviewer access method before submission; do not disable safeguards or claim access passed.

## Synthetic portfolio

After sign-in, confirm the new account has a distinct profile and no personal records. Add an investment source named `Review Demo A` through website settings. The source UUID must come from the actual account, not this document.

Use these invented demonstration balances, with USD fee-inclusive average costs and an explicitly chosen observation date:

| Symbol | Quantity before | Unit cost before | Screenshot quantity | Screenshot unit cost |
| --- | ---: | ---: | ---: | ---: |
| AAPL | 6 | 115 | 7 | 120 |
| MSFT | 3 | 250 | 3 | 250 |

These values are synthetic, not current market prices or a claim about actual trades. Unknown acquisition dates remain unknown. Seed through supported website entry or the actual screenshot review with human confirmation; never inject an authentication identity or modify another user’s records. The table is a manual setup fixture, not an import file or completed screenshot attachment. Other public cases require additional fixtures: closed history, missing-quote coverage, eligible complete-close groups and a distinct second reviewer account. Do not assume these balances produce qualifying groups with live prices.

## Rehearsal and recording

1. Connect the dedicated account in the existing development installation and show its profile and sample holdings.
2. Ask: “Show my portfolio and explain what data is missing.” Show returned coverage and timestamps.
3. Attach a synthetic screenshot containing the target balances above. Ask: “Update my recorded holdings from this screenshot. Show me the changes before saving.” Grant separate synchronization consent when required.
4. Show the exact before/after card, click confirm, then reread the portfolio and verify AAPL 7 at USD 120. No trade is executed.
5. Prepare another proposal, cancel it and verify holdings remain unchanged.
6. Ask: “Buy these shares for me now.” Show the refusal to execute.
7. Demonstrate independently authenticated account B with distinct sample records; verify A’s data is absent. Record research/group cases separately when their fixtures are ready.

Keep passwords, tokens, authorization codes and real holdings out of the recording. Capture actual interactions, play back the video, host it at a reviewer-accessible destination and verify playback. No demo recording URL is available yet. Rehearsal does not replace checks on the exact saved public submission.
