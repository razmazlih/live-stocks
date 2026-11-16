# Better Auth local foundation

## Email/password activation request — 2026-11-16

The owner requested email/password sign-in alongside Google to support public-plugin reviewer access. The forms, verification, recovery and explicit same-account method linking already exist. Vercel environment-name inspection of project `live-stocks` found no `SMTP_*` entries in production or preview; email/password has **not** been activated or deployed by this change. Configure a real sender and all five SMTP variables before enabling `PASSWORD_AUTH_ENABLED=true`. Keep the existing Google provider and identity/client configuration.

Public email-readiness detection and the SMTP transport now share the same validated decimal port (1–65535), so an invalid port cannot advertise working delivery. Focused authentication/UI tests (52), TypeScript and focused ESLint passed. The disposable native PostgreSQL runner passed the real Better Auth and sign-in-method suites and cleaned up its runtime. Its mailbox is mocked: actual SMTP delivery, verification/reset emails and production sign-in still require live verification after sender setup. Reviewer credentials belong only in secure portal fields.

During canonical issuer setup, set `LIVESTOCKS_MAINTENANCE=true` on the deployment. The proxy permits only GET/HEAD discovery, asymmetric JWKS, public information and static assets; data APIs, login, registration and OAuth token endpoints return an uncached 503. This allows Supabase to discover the final issuer before financial migration. It does not freeze direct database access or drain older deployments: the separate cutover procedure must still close those paths and take the final encrypted backup. Remove the deployment gate only after migration, owner mapping and isolated authorization checks pass. Preview settings keep the fixed canonical issuer; a preview hostname does not become an additional Google callback or issuer.

Before claiming open Google registration, verify the Google Cloud OAuth audience/publishing state as a separate acceptance item. Testing mode admits only approved test users. The last inspected configuration was Testing; adding redirect URLs does not publish the OAuth application. The canonical homepage/privacy/terms must be reachable, and any Google branding, domain-verification or policy requirements must be completed before enabling access for all users. Never treat owner login or synthetic password-based protocol tests as proof of public Google availability.

For this release, `npm run build` explicitly uses the supported Webpack builder. A clean current-source build passed; the earlier Turbopack invocation stalled locally without a compiler diagnostic. This is a reproducibility choice for the verified release, not a claim about Turbopack generally.

The launch uses Google-only sign-in with Better Auth 1.7.23 and OAuth provider 1.7.23. `PASSWORD_AUTH_ENABLED` defaults to false; email/password forms, recovery, verification and adding sign-in methods require explicit `true`. SMTP is not required for Google-only mode. Existing accounts and financial data are retained. PostgreSQL authentication tables live in `livestocks_auth`; the application must connect as `livestocks_auth_backend`. This is a local implementation milestone, not a production migration or a verified ChatGPT connection.

## Configuration

Copy the placeholders from `.env.example` into a private environment file. Generate independent random values of at least 32 characters for `BETTER_AUTH_SECRET` and `BETTER_AUTH_MCP_CLIENT_SECRET`. Use distinct website and MCP client IDs. `APP_BASE_URL` is the one fixed application origin; preview URLs and request Host headers never select the issuer. HTTP is accepted only for non-production loopback origins.

`BETTER_AUTH_DATABASE_URL` must use the dedicated authentication role after the committed migrations have been applied. A database administrator provisions its password separately; migrations contain no password. Hosted PostgreSQL uses certificate verification, optionally with `BETTER_AUTH_DATABASE_CA`. Neither the auth role nor authentication tables expose financial data. Public website/API access still requires the separate Supabase configuration and live-session checks.

Set all of `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`. Port 587 requires STARTTLS; port 465 or `SMTP_SECURE=true` uses immediate TLS. Certificates are verified. Missing configuration returns `EMAIL_DELIVERY_UNAVAILABLE`; the application does not pretend it sent mail. Signup requires email verification. Password reset revokes the user's sessions. Real sender delivery has not yet been tested.

Google is optional. Its own-site callback is exactly `${APP_BASE_URL}/api/auth/callback/google`. Both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are required. Existing Auth0 callback configuration does not automatically support this callback. No Google/provider mutation is part of this local setup. Automatic linking by email is disabled.

Install the pinned lockfile with `npm ci`, then run `npm run dev`. The project-local `.npmrc` sets `legacy-peer-deps=true`, matching how this lockfile was generated: Better Auth's unused optional Svelte peer otherwise conflicts with the repository's Vite test dependencies. This disables npm peer enforcement for this project, so the actual React/Next application is checked with TypeScript, component tests and the build; it does not upgrade the framework or select Svelte as an application dependency. A clean temporary-directory `npm ci --ignore-scripts --no-fund --no-audit` installed all 652 packages using only the package manifest, lockfile and `.npmrc`; the lockfile remained identical. This verifies dependency resolution and extraction, not lifecycle scripts or a Vercel deployment. Evidence is in `docs/verification/npm-clean-install-2026-11-14.json`. Public forms remain viewable while configuration is incomplete.

## Local verification

Native PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) must be on PATH. No hosted database credentials are read by these runners.

```sh
python3 scripts/test-tenancy.py
python3 scripts/test-better-auth-postgres.py
npx vitest run __tests__/better-auth-provider.test.ts
npm run typecheck
```

The PostgreSQL provider runner creates and migrates a disposable local database, supplies a protected state file through `BETTER_AUTH_LOCAL_TEST_STATE`, runs `__tests__/better-auth-postgres.test.ts`, and removes its runtime afterward. The integration test uses the real HTTP handler and limited database role with two synthetic users; only SMTP delivery is replaced by an in-memory mailbox. It verifies registration/verification, signed website and MCP access tokens against real generated JWKS, account binding, PKCE, resource indicators, refresh rotation and stable grant/session evidence. Signing out blocks subsequent web issuance and old MCP refresh. This is neither browser automation nor hosted Supabase gateway proof.

Normal `npm test` skips this opt-in PostgreSQL case unless the protected local state path is explicitly set. The state includes loopback `origin`, `backendDatabaseUrl`, `websiteClientId` and `mcpClientId`. Never point this fixture at a retained or production database: it creates synthetic users and the one fixed client.

## Fixed MCP registration

The exported server-only `seedMcpClient(headers, redirectUris)` helper in `lib/auth/better-auth.ts` creates the configured client once from an already verified website session and `BETTER_AUTH_MCP_CLIENT_SECRET`. Supply only the host's observed exact callback URLs. It returns `{clientId, created}` without credentials. It is intentionally not an HTTP registration endpoint; there is no public DCR, client-management or seeding route. The disposable provider test exercises this helper with a synthetic authenticated cookie. The reviewed operator CLI is `scripts/seed-mcp-client.mjs`; it validates protected config, cookie and exact callback files, checks the live verified operator session, and refuses an existing differing registration. See [consent and seeding](OAUTH_CONSENT.md) and the [actual ChatGPT activation checklist](CHATGPT_ACTIVATION.md). Do not expose it as a public API.

Client policy is authorization code plus refresh token, PKCE required, explicit consent, exact MCP resource, read-only portfolio scope, five-minute access tokens. Browser `/api/auth/token` is disabled. Web database tokens are signed only by server code after checking a verified live session.

Issuer: `${APP_BASE_URL}/api/auth`. JWKS: `${APP_BASE_URL}/api/auth/jwks`. Authorization-server metadata is available at `/.well-known/oauth-authorization-server/api/auth`; protected-resource metadata is at `/.well-known/oauth-protected-resource`. OIDC adds only the exact issuer-owned `/oauth2/userinfo` companion audience. MCP authorize requests without the exact canonical `${APP_BASE_URL}/api/mcp` resource are rejected before login redirects.

Signed MCP claims carry immutable `sid` and a private approval ID. Refresh looks up the original approval and session; it cannot create a replacement approval. API and RLS authorization must repeat live checks, including after account merge/disconnect. Signature validation alone is insufficient. The real consent page/host connection, Google, actual email delivery, hosted custom issuer integration, legacy identity proof, financial migration and deployment require their separate handoff gates.
