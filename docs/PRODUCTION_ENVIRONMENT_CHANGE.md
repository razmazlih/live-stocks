# Production account configuration

Prepared for `live-stocks` (`prj_rq3UoLiTcbg3yl28LGDsxNiVbvgb`) in team `team_Vwue1DdSHaQvCACjh6T8CWVq`.

A read-only preflight on 2026-11-14 found none of these 13 keys in the production environment. Create them only when absent; never upsert or replace an existing value as part of this change. Target production only. Do not copy production secrets into preview environments.

| Key | Storage | Purpose |
| --- | --- | --- |
| `AUTH0_CLIENT_SECRET` | Sensitive | Existing LiveStocks website OAuth client |
| `AUTH0_SECRET` | Sensitive | Website session-cookie encryption |
| `CREDENTIAL_ENCRYPTION_KEY` | Sensitive | Same key already used for verified legacy credential encryption |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | Sensitive | Existing grant manager, restricted to `read:grants delete:grants` |
| `AUTH0_DOMAIN` | Config | Existing approved Auth0 issuer |
| `AUTH0_CLIENT_ID` | Config | Website client identifier |
| `AUTH0_WEB_AUDIENCE` | Config | Canonical `/api/web` resource |
| `AUTH0_MCP_CLIENT_ID` | Config | Existing read-only MCP client identifier |
| `AUTH0_MCP_AUDIENCE` | Config | Canonical `/api/mcp` resource |
| `AUTH0_MANAGEMENT_CLIENT_ID` | Config | Restricted grant-manager identifier |
| `APP_BASE_URL` | Config | `https://razmaz-live-stocks.vercel.app` |
| `PUBLISHER_NAME` | Config/public page | User-approved publisher name |
| `PUBLIC_SUPPORT_EMAIL` | Config/public page | User-approved public support address |

Secret values stay in protected local storage and the production secret store, never this document, command arguments or Git. Existing Supabase variables and database credentials are outside this change. The Google client secret remains in Auth0, and the MCP client secret belongs only to its authorized host configuration.

Creating these settings does not replace an existing deployment, apply a database migration or promote a build. Stage the exact committed code with `--prod --skip-domain`, verify the staged build, and handle the backed-up ownership cutover separately.

## Applied configuration checkpoint

On 2026-11-14 the user explicitly approved this exact create-only set. All 13 variables were created with no upsert or overwrite, then verified through a metadata-only read-back: exact production-only targets, four sensitive secrets and nine config values. Preview secrets were not added. The active deployment and database were unchanged by this configuration step.
