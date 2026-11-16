# On-site authentication feasibility

Assessment date: 2026-11-14. Status: **the user approved the Better Auth direction on this date; the local foundation is implemented. Production cutover has not occurred**.

Better Auth can keep email/password signup, verification, login and password-reset forms on `https://razmaz-live-stocks.vercel.app`. Google still requires its normal Google authorization page. The same application can issue OAuth authorization codes to the existing read-only MCP integration. This avoids an OAuth password grant and does not require Auth0 Enterprise refresh metadata.

This changes who operates authentication: LiveStocks would store password hashes, sessions, OAuth grants and signing keys in its existing Supabase PostgreSQL database, and run the authentication server in its Next.js deployment. It is a meaningful authentication replacement, not a cosmetic login-page change. No production provider, Google configuration, hosted database, deployment alias, owner identity or main application dependencies were changed for this assessment.

## Exact candidate and evidence

Public npm metadata and the official documentation identify **`better-auth@1.7.23` and `@better-auth/oauth-provider@1.7.23`**, published November 13, as the current stable release. Pin both and the lockfile. The isolated package manifest and lockfile are in [`scripts/better-auth-feasibility`](../scripts/better-auth-feasibility/). The core release pins its companion adapters/core packages to 1.7.23; it uses `better-call@1.4.5`, `@better-fetch/fetch@1.3.3`, and compatible `jose`, Kysely and Zod dependencies. PostgreSQL requires a pinned compatible `pg` driver in a later implementation. Its Next.js/React peer ranges include this repository's Next.js 16 and React 18. The dummy probe ran on Node 20.20.0; production runtime compatibility still needs a build test.

The isolated dependency audit reported zero known vulnerabilities. This is not an assurance that the software has no vulnerabilities. Recent upstream security fixes are directly relevant: OAuth email-verification/profile-binding fixes shipped in 1.7.16; OAuth-state/magic-link and OAuth Proxy account-takeover fixes shipped in 1.7.7. Avoid optional OAuth Proxy, Magic Link, SSO, Expo and Electron plugins; disable implicit same-email linking. Recheck advisories at implementation and each upgrade, and upgrade participating nodes together. Sources: [current release](https://github.com/better-auth/better-auth/releases), [email-verification advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-9hm7-xhfp-cx58), [state-confusion advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm), [proxy advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf).

### Actual dummy-only gate

The Fetch handler was exercised in process with two synthetic users, a memory adapter, generated disposable keys, and verification messages captured in memory. All external `fetch` calls are prohibited. No real email or Google interaction occurs. The guarded run passed **24 assertions**. The [sanitized report](verification/better-auth-feasibility-2026-11-14.json) preserves its limitations.

| Behavior | Observation |
| --- | --- |
| Unverified email login | Denied; verification then enables login |
| Two accounts | Distinct users; OAuth JWTs bind to the correct account |
| Authorization + S256 PKCE + explicit consent | Signed ES256 access JWT and ID token issued; literal `role=authenticated` and `sid` present |
| Wrong resource at authorization/code exchange/refresh | Rejected; unlike the previously accepted Auth0 code-exchange exception |
| Omitted resource at code exchange | Preserves the originally authorized target |
| Missing resource at initial authorization | Core provider issues an opaque token, not an accepted MCP JWT; **our strict initial-request requirement still needs an explicit route guard** |
| Wrong PKCE / repeated code | Rejected |
| Two refresh rotations | Subject and `sid` remain stable |
| Dynamic registration / non-admin client creation | Denied with explicit privileges configuration |
| Browser JWT `/token` route | Disabled |
| Refresh after sign-out, provider defaults | **FAIL: a token is still issued** |
| Refresh after sign-out, application live-session extension | Rejected with `invalid_grant` |
| Old grant after changing its approval generation | Rejected; a newly authorized grant binds to the new generation |

These results are **not** PostgreSQL concurrency, browser-cookie, SMTP, real Google, hosted Supabase trust, or ChatGPT-host verification. ID-token presence is recorded; complete OIDC claim validation remains in the next gate. The missing-resource case deliberately records “no valid MCP JWT,” not “authorization rejected.”

To reproduce without installing into the application:

```sh
probe_dir="$(mktemp -d /private/tmp/livestocks-better-auth-probe-XXXXXX)"
cp scripts/better-auth-feasibility/{package.json,package-lock.json,probe.mjs} "$probe_dir/"
npm ci --prefix "$probe_dir" --ignore-scripts --no-fund
PROBE_SESSION_GUARD=1 node "$probe_dir/probe.mjs"
```

Omitting `PROBE_SESSION_GUARD=1` intentionally reproduces the default sign-out/refresh failure. This fixture is not production configuration or a production adapter.

## Architecture delta

1. **Authentication storage and same-origin forms.** Use a dedicated, non-exposed PostgreSQL schema for Better Auth tables, with a narrowly scoped backend database role. No browser or Data API grants on password hashes, verification tokens, sessions, refresh tokens or private keys. Keep financial tables and existing canonical-profile/data-merge work. Use the supported email/password and Google APIs, verified email before portfolio access, exact trusted origins, secure HttpOnly cookies, and distributed rate limiting. Configure real email delivery and test verification/reset expiry and one-time consumption; a Vercel URL does not itself provide an email sender. No paid service is assumed. [Email/password API](https://better-auth.com/docs/authentication/email-password), [security behavior](https://better-auth.com/docs/reference/security).

2. **One own-origin issuer.** Fix the issuer to `https://razmaz-live-stocks.vercel.app/api/auth`; never derive it from an untrusted Host header or preview deployment. Publish its OIDC discovery, RFC 8414 metadata routes and JWKS. Keep the MCP resource identifier `https://razmaz-live-stocks.vercel.app/api/mcp`. Use ES256 explicitly, preserve old public keys during rotation, and keep secrets/signing material outside public schemas and logs. Disable the JWT plugin's public `/token` route and `set-auth-jwt` header, as the provider documentation requires. [OAuth provider configuration](https://better-auth.com/docs/plugins/oauth-provider), [JWT configuration](https://better-auth.com/docs/plugins/jwt).

3. **Restricted MCP client.** Register one administrator-managed confidential client for the actual ChatGPT callback, retaining S256 PKCE and explicit consent. Disable DCR, unauthenticated registration, CIMD and client-credentials grants. Explicitly authorize client/resource administration; do not rely on permissive defaults. Link only the MCP resource and read scope. Reject missing, multiple or mismatched MCP authorization resources before issuing a code. Require exact issuer/client/resource/scope/role/email/session/grant checks at the MCP API. OIDC-requested access JWT audiences also contain the fixed UserInfo audience; allow only that documented companion audience, not arbitrary extra audiences. Preserve the existing private ChatGPT App and plugin IDs; their actual OAuth reconfiguration remains an independent host gate. [Client configuration](https://better-auth.com/docs/plugins/oauth-provider/clients).

4. **Website database requests.** Validate the database-backed browser session, then mint a short-lived, website-audience-only database JWT on the server with the JWT plugin's server-only `signJWT` API (confirmed in installed 1.7.23 source). Set the signed subject/session and literal `role=authenticated` from validated records, never request bodies. Use a distinct fixed website client/type and write scope; MCP tokens remain read-only. No public signing endpoint. This preserves per-request Supabase clients and RLS without using an administrative Supabase credential for ordinary financial reads/writes. This exact web-token path is proposed, not exercised by the dummy MCP probe.

5. **Supabase trust and RLS.** Supabase now documents a **Custom OIDC** third-party integration: HTTPS issuer discovery, asymmetric JWTs with `kid`, and the literal role claim. This is JWT trust, not a social-login provider that converts users into Supabase Auth identities. Add the own-origin issuer only after a hosted disposable-project test; do not assume a local JWKS/PostgREST pass proves the hosted gateway. Key updates may take up to 30 minutes. Read `auth.jwt()->>'sub'` as text, namespace identity by issuer and subject, and reject foreign issuers/audiences/clients. [Custom OIDC integration](https://supabase.com/docs/guides/auth/third-party/custom-oidc), [third-party limitations](https://supabase.com/docs/guides/auth/third-party/overview).

## Durable revocation and merge contract

Use the provider's stored **session ID and consent reference**, not a fresh `iat` or mutable user-global timestamp. Maintain a private application approval record with a random generation ID, identity, client, canonical profile, expiry and revoked state. Select that trusted reference during authorization using `postLogin.consentReferenceId`; do not accept an arbitrary reference from the browser. The reference is retained in codes and refresh records. An access-token extension receives `referenceId`, `sessionId`, user, client and grant type on issuance, including refresh. The dummy gate proves a changed reference does not silently update an older refresh grant. [Consent references](https://better-auth.com/docs/plugins/oauth-provider/sign-in-flow), [extension and storage schema](https://better-auth.com/docs/plugins/oauth-provider/reference).

Before issuance, require an active verified user/session and an active matching approval reference; stamp both into the signed access token. RLS independently checks those same live private records on every financial operation. This is essential: JWT signatures alone remain valid after revocation, and an issuance can race with a merge. A token minted concurrently with revocation must still fail the DB guard. The PostgreSQL implementation must use transaction/locking rules that prevent a revoked approval or session from being re-created by a delayed refresh.

For a merge, lock both canonical profiles, revoke existing sessions/approval generations/widget credentials as specified by the merge policy, move/alias data atomically, and require a new authenticated session and explicit MCP consent for new grants. Old JWTs fail the live record guard immediately; old refresh tokens cannot inherit a new generation. Delete/revoke stored refresh records as cleanup, not as the sole security boundary. Do not treat deleting consent or browser sign-out alone as sufficient. These provider defaults are why the application guard is required. [Token and revocation behavior](https://better-auth.com/docs/plugins/oauth-provider/tokens).

## Existing Auth0 identities and data

Do not copy or attempt to export Auth0 passwords. Users establish a new local password through verified registration/recovery, or sign in with Google through the new own-origin callback. Leave existing Auth0 accounts and the original Google callback intact during a reversible migration window.

Bind a new Better Auth identity to an existing canonical portfolio only after fresh proof of the old Auth0 identity **and** the new identity, followed by explicit confirmation. The previous owner capture proves only the old identity; it does not pre-authorize an arbitrary new account with the same email. Store migration aliases as `(issuer, subject)` pairs. Matching verified emails suggest a link; they do not authorize one. For native Google/password linking, set `account.accountLinking.disableImplicitLinking=true` and require the site's two-proof flow before explicit linking. Existing same-email OAuth attempts will otherwise be linked by the provider's default. Preserve financial records and audit provenance; do not replace ownership from email or overwrite portfolios. [Linking controls](https://better-auth.com/docs/concepts/users-accounts).

## Required decision and gates

**Recommendation:** choose this as the next isolated implementation candidate if operating the authentication database and mail delivery is acceptable. It directly fits the on-site requirement and exposes the grant/session state needed for strict revocation. Do not cut over based on these memory-adapter results.

Before replacing Auth0:

- Run the same protocol suite on disposable PostgreSQL, including concurrent refresh/code replay, missing-resource rejection, wrong-client/audience mixing, consent denial, altered signed continuation, and grant/session deletion during issuance.
- Exercise actual Next.js browser forms and cookies in Chromium and WebKit with third-party cookies unavailable. Verify password policy, enumeration resistance, CSRF, reset/verification replay, email delivery and Google identity binding.
- Verify website and MCP JWTs through hosted Supabase Custom OIDC and every financial-table RLS policy, including revoked tokens sent directly to REST and two-account merge races. Use ES256 and production-shaped metadata.
- Exercise the existing ChatGPT App's actual OAuth connection and `get_profile`/portfolio calls. Record callback and OIDC/resource behavior; preserve App/plugin IDs and branding.
- Prove backup/restore, encrypted-key recovery, connection-pool limits, distributed throttling, dependency-update procedure and rollback without orphaned identities. Review all generated migrations before a hosted change.

A failure blocks that integration step. No fallback to anonymous RLS, service-role portfolio access, ROPG, automatic email-only linking or acceptance of stale grants is part of this proposal.
