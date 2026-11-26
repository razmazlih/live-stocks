-- Operator-only fallback when the Better Auth SDK seeder cannot be used.
-- Run inside one explicit transaction after enabling the secondary client in
-- private.auth_config. Bind app.livestocks_blue_mcp_secret_digest to the
-- unpadded base64url SHA-256 digest of the new secret. Keep the plaintext out
-- of SQL, command arguments and logs. The exact hosted callback was observed
-- in the new ChatGPT App form.
do $register_blue_mcp$
declare
  primary_client_id constant text := 'livestocks-mcp-chatgpt';
  blue_client_id constant text := 'livestocks-mcp-chatgpt-blue';
  issuer constant text := 'https://razmaz-live-stocks.vercel.app/api/auth';
  audience constant text := 'https://razmaz-live-stocks.vercel.app/api/mcp';
  redirect_uris constant jsonb := '["https://chatgpt.com/connector_platform_oauth_redirect"]';
  grant_types constant jsonb := '["authorization_code", "refresh_token"]';
  response_types constant jsonb := '["code"]';
  scopes constant jsonb := '["openid", "email", "profile", "offline_access", "portfolio:read", "portfolio:transactions"]';
  digest text := current_setting('app.livestocks_blue_mcp_secret_digest', true);
  config private.auth_config%rowtype;
  primary_client livestocks_auth."oauthClient"%rowtype;
  blue_client livestocks_auth."oauthClient"%rowtype;
  resource livestocks_auth."oauthResource"%rowtype;
  registered_at timestamptz := date_trunc('second', clock_timestamp());
begin
  if digest is null or digest !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then
    raise exception 'Supply an unpadded base64url SHA-256 digest for the new MCP client';
  end if;

  select * into strict config from private.auth_config where singleton for update;
  if config.auth_provider is distinct from 'better_auth' or config.issuer is distinct from issuer
    or config.mcp_audience is distinct from audience or config.mcp_client_id is distinct from primary_client_id
    or config.mcp_secondary_client_id is distinct from blue_client_id then
    raise exception 'The expected LiveStocks OAuth configuration is not active';
  end if;

  select * into strict primary_client from livestocks_auth."oauthClient"
    where "clientId" = primary_client_id for share;
  if primary_client.disabled is distinct from false or primary_client."requirePKCE" is distinct from true
    or primary_client."skipConsent" is distinct from false or primary_client."tokenEndpointAuthMethod" is distinct from 'client_secret_post'
    or primary_client."applicationType" is distinct from 'web' or primary_client."redirectUris" is distinct from redirect_uris
    or primary_client."grantTypes" is distinct from grant_types or primary_client."responseTypes" is distinct from response_types
    or primary_client."clientDiscoveryId" is not null or primary_client."referenceId" is not null
    or primary_client."clientSecret" is null or primary_client."clientSecret" = digest
    or not exists (select 1 from livestocks_auth."user" where id = primary_client."userId" and "emailVerified") then
    raise exception 'The primary MCP client does not match the expected registration';
  end if;

  select * into strict resource from livestocks_auth."oauthResource" where identifier = audience for share;
  if resource.disabled is distinct from false or resource."accessTokenTtl" is distinct from 300
    or resource."signingAlgorithm" is distinct from 'ES256' or resource."dpopBoundAccessTokensRequired" is distinct from false
    or resource."signingKeyId" is not null or resource."refreshTokenTtl" is not null or resource."customClaims" is not null
    or (resource."allowedScopes" @> scopes) is distinct from true
    or (select jsonb_agg("resourceId") from livestocks_auth."oauthClientResource" where "clientId" = primary_client_id)
      is distinct from jsonb_build_array(audience) then
    raise exception 'The shared MCP resource does not match the expected policy';
  end if;

  select * into blue_client from livestocks_auth."oauthClient" where "clientId" = blue_client_id for update;
  if found then
    if blue_client."clientSecret" is distinct from digest or blue_client.disabled is distinct from false
      or blue_client."requirePKCE" is distinct from true or blue_client."skipConsent" is distinct from false
      or blue_client."tokenEndpointAuthMethod" is distinct from 'client_secret_post' or blue_client."applicationType" is distinct from 'web'
      or blue_client."redirectUris" is distinct from redirect_uris or blue_client."grantTypes" is distinct from grant_types
      or blue_client."responseTypes" is distinct from response_types or blue_client.scopes is distinct from scopes
      or blue_client."clientCredentialsScopes" is distinct from '[]'::jsonb or blue_client."dpopBoundAccessTokens" is distinct from false
      or blue_client."userId" is distinct from primary_client."userId" or blue_client."clientDiscoveryId" is not null
      or blue_client."referenceId" is not null
      or (select jsonb_agg("resourceId") from livestocks_auth."oauthClientResource" where "clientId" = blue_client_id)
        is distinct from jsonb_build_array(audience) then
      raise exception 'The blue MCP client already exists with a different registration';
    end if;
    return;
  end if;

  insert into livestocks_auth."oauthClient" (
    id, "clientId", "clientSecret", disabled, "skipConsent", scopes, "clientCredentialsScopes", "userId",
    "createdAt", "updatedAt", name, "redirectUris", "tokenEndpointAuthMethod", "applicationType",
    "grantTypes", "responseTypes", "requirePKCE", "dpopBoundAccessTokens"
  ) values (
    gen_random_uuid()::text, blue_client_id, digest, false, false, scopes, '[]'::jsonb, primary_client."userId",
    registered_at, registered_at, 'LiveStocks ChatGPT Blue', redirect_uris, 'client_secret_post', 'web',
    grant_types, response_types, true, false
  );
  insert into livestocks_auth."oauthClientResource" (id, "clientId", "resourceId", "createdAt")
  values (gen_random_uuid()::text, blue_client_id, audience, registered_at);
end;
$register_blue_mcp$;
