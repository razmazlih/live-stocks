# Google and password on the same account

**Launch mode is Google-only.** The optional flow below is disabled unless the operator explicitly sets `PASSWORD_AUTH_ENABLED=true`. Adding a password also requires working email delivery. Existing accounts and financial data are retained when the mode is off.

The account settings now offer explicit sign-in method addition for every verified Better Auth user. Both methods retain the **same Better Auth user ID and canonical portfolio**. This is separate from combining financial records belonging to pre-existing distinct identities; that process still requires its separate proofs and reviewed merge.

Better Auth's user email is unique, and implicit email-based linking remains disabled. An unsuccessful same-email Google login does not create a second account or grant portfolio access. The login screen directs an existing user to sign in using their original method and add another method in settings.

## Password account → add Google

1. Settings displays the current account email and actual connected methods read on the server.
2. The user explicitly approves adding a method and supplies the current password. The server calls the official `verifyPassword` API and records the attempt before verification, limited to five attempts per user per fifteen minutes across server instances.
3. The server starts `linkSocialAccount` with a fixed Google provider, basic identity scopes, same-origin completion/error paths and the current email as a hint. A hint is not proof.
4. The SDK handles OAuth state, state cookie, PKCE and code exchange. Its state binds the original user and an encrypted reference to the original live session. The app also supplies a short-lived signed operation ticket.
5. Before linking, the app's `user.validateUserInfo` hook requires Google to return a verified email matching the current account, the original and current session/user to agree, and the private operation to be unused and unexpired. The operation is consumed atomically. A replay, account switch, signed-out session, different email or unverified email fails closed.
6. The SDK attaches the provider account to the existing user. No portfolio table or identity mapping is changed. The return page reads the actual connected methods; URL parameters alone cannot claim success.

Public `/api/auth/link-social` and `/api/auth/verify-password` remain disabled; their official server APIs are invoked only by the protected wrapper. The wrapper accepts only `{password, consent:true}`; it does not accept an email, user ID, provider choice, ID token or callback URL. Errors omit raw provider details. Failed/expired operations require a fresh attempt, without removing any already connected method.

## Google account → add a password

After explicit approval, the server sends the official password-reset/setup email to the verified email read from the current account. A browser-supplied email is never accepted. Consuming that email link creates the credential on the existing user ID, rather than creating a second user. Google remains connected. Password reset revokes existing sessions, so the user signs in again after completing setup.

This path uses control of the existing signed-in account and its email link. It does not claim that the user retyped their Google password; an active Google session may satisfy a Google authorization flow. Actual email delivery and Google's real hosted flow require separate environment checks.

## Interfaces and storage

- `GET /api/account/sign-in-methods`: current account ID/email, password/Google presence and configured capabilities.
- `POST /api/account/sign-in-methods/google`: explicit consent and current password; returns the SDK's checked Google authorization URL and OAuth state cookie.
- `POST /api/account/sign-in-methods/password`: explicit consent only; sends setup email to the current account.
- `/account/sign-in-methods/complete`: bilingual status/error page reading the server's current methods.
- `20261115094000_sign_in_method_operations.sql`: new private one-use operation/attempt storage and limited backend function. It does not edit the earlier migration sources or financial tables and must be included in the migration bundle.

The implementation follows the [official account-linking guidance](https://better-auth.com/docs/concepts/users-accounts) and installed Better Auth 1.7.23 source. The tested Google redirect exchange obtains identity information from the provider's token endpoint; no browser ID-token submission is used by this flow.

## Verification scope

`__tests__/sign-in-methods-postgres.test.ts` runs real SDK and application HTTP handlers against disposable PostgreSQL. Only Google's token/JWKS transport and email delivery are mocked. It checks valid and invalid current-password proof, origin/body restrictions, disabled public linking, matching verified Google email, wrong email, unverified email, account switch, callback replay, expired operation, initiating-session logout, method status, both login methods resolving to one user, Google-first password setup and session revocation, and the attempt limit. It compares the original profile and all six portfolio tables before and after linking, including a position and its lot; a Google-first portfolio is also preserved through password setup.

Run `python3 scripts/test-better-auth-postgres.py`. Component tests additionally check explicit consent, password clearing, safe Google navigation and server-derived completion state. These tests do not claim a real Google or SMTP delivery test, a production deployment or automatic consolidation of pre-existing separate portfolios.
