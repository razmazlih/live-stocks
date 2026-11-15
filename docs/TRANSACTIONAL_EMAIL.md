# Transactional email setup — deferred

The user selected **Google-only launch** on 2026-11-15. Brevo onboarding is stopped; no SMTP key is captured and no email is sent. The instructions below are retained for a future explicit email/password opt-in, not an active setup task. `PASSWORD_AUTH_ENABLED` defaults to false.

LiveStocks uses provider-neutral SMTP for verification and password recovery. Personal Gmail SMTP is no longer selected. The former Gmail app password was revoked and its local saved copy removed; it must not be reused.

## Brevo Free

Checked on 2026-11-15: the Free plan includes transactional email and 300 daily sends, costs $0, and requires no credit card. Select **Free**, without trials or paid add-ons. Published plan terms do not establish that this particular account has completed activation. [Plan details](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans).

Complete onboarding with truthful operator details. The observed address form states that an organization address appears in sent email; the operator must supply an address they accept disclosing. Verify the chosen sender and transactional sending before deployment configuration.

The existing `vercel.app` website does not give the operator DNS control over that domain. Brevo describes a **temporary** sender rewrite for unauthenticated/free-address senders, including a `t-sender-sib.com` address for transactional mail. This is not an authenticated LiveStocks-owned domain, a permanent availability promise, or proof of inbox delivery. Stop and report if the actual account requires domain ownership or paid activation. [Sender requirements and temporary fallback](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

| Variable | Value |
| --- | --- |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` (the application requires STARTTLS) |
| `SMTP_USER` | Exact SMTP login displayed by Brevo; it may differ from the account email |
| `SMTP_PASSWORD` | Dedicated SMTP key, not an account password or API key |
| `SMTP_FROM` | `LiveStocks <verified-sender-address>` with the actual approved sender |

Port 465 with `SMTP_SECURE=true` is also supported. The application verifies TLS certificates. Keep credentials in an owned private file outside the repository or deployment secret storage, never in client variables, screenshots, shell history or documentation. The older `scripts/setup-smtp-local.mjs` collector is Gmail-specific and is **not** a Brevo collector. [SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [SMTP key management](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys).

## Failure and delivery checks

`lib/auth/auth-email.ts` awaits SMTP acceptance, uses bounded connection/socket timeouts, closes the transport, and maps failures to an unavailable response without logging credentials or recovery URLs. Missing configuration does not report successful delivery. There is no automatic retry loop: a timed-out request may already have been accepted, so unconditional retry could duplicate messages. Users can request a fresh verification/recovery link, subject to authentication rate limits. SMTP acceptance alone is not inbox receipt.

Before calling delivery verified, record real verification and reset emails received at an operator-authorized inbox, successful link consumption, and rejection of expired/reused links. Confirm the visible sender and any provider rewrite. Keep message tokens and links out of evidence reports. Local tests use a synthetic mailbox and do not establish real delivery.

Current evidence: Safari reached the required organization-address step. This workflow has not yet recorded sender verification, SMTP credential capture, an actual SMTP send, or inbox delivery.
