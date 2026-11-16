-- Auth0 owns identity; Supabase owns data. No auth.users FK or auth.uid() cast.
-- Run only inside this transaction after a verified-owner backup/cutover check.
-- A populated database requires app.legacy_owner_subject. A legacy Finnhub
-- token additionally requires app.legacy_finnhub_encrypted from the admin script.
-- Neither value is selected from the first signup, email, or user metadata.
begin;

select pg_catalog.pg_advisory_xact_lock(73412311661001);
lock table public.positions, public.position_lots, public.position_plans,
  public.settings, public.watchlist_groups, public.watchlist_tickers
  in access exclusive mode;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.user_profiles (
  id text primary key check (length(id) between 1 and 255 and btrim(id) <> ''),
  created_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

create table private.auth_config (
  singleton boolean primary key default true check (singleton),
  issuer text not null check (length(issuer) > 0 and issuer = btrim(issuer)),
  website_client_id text not null check (length(website_client_id) > 0 and website_client_id = btrim(website_client_id)),
  mcp_client_id text not null check (length(mcp_client_id) > 0 and mcp_client_id = btrim(mcp_client_id)),
  website_audience text not null check (length(website_audience) > 0 and website_audience = btrim(website_audience)),
  mcp_audience text not null check (length(mcp_audience) > 0 and mcp_audience = btrim(mcp_audience)),
  check (website_client_id <> mcp_client_id),
  check (website_audience <> mcp_audience)
);
create table private.mcp_connections (
  user_id text primary key references public.user_profiles(id) on delete restrict,
  enabled boolean not null default true,
  valid_after bigint not null default 0 check (valid_after >= 0),
  last_connected_at timestamptz,
  revoked_at timestamptz
);
create table private.user_credentials (
  user_id text primary key references public.user_profiles(id) on delete restrict,
  encrypted_value text not null check (length(btrim(encrypted_value)) > 0),
  updated_at timestamptz not null default now()
);
create table private.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.user_profiles(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at > created_at)
);
create index widget_tokens_user_id_idx on private.widget_tokens(user_id);
alter table private.auth_config enable row level security;
alter table private.mcp_connections enable row level security;
alter table private.user_credentials enable row level security;
alter table private.widget_tokens enable row level security;
revoke all on private.auth_config, private.mcp_connections, private.user_credentials,
  private.widget_tokens from public, anon, authenticated;
grant all on private.auth_config, private.mcp_connections, private.user_credentials,
  private.widget_tokens to service_role;

-- Config remains inaccessible to API roles. Missing config denies every request.
do $$
declare
  v_issuer text := nullif(current_setting('app.auth0_issuer', true), '');
  v_web_client text := nullif(current_setting('app.auth0_website_client_id', true), '');
  v_mcp_client text := nullif(current_setting('app.auth0_mcp_client_id', true), '');
  v_web_aud text := nullif(current_setting('app.auth0_website_audience', true), '');
  v_mcp_aud text := nullif(current_setting('app.auth0_mcp_audience', true), '');
begin
  if v_issuer is not null or v_web_client is not null or v_mcp_client is not null
     or v_web_aud is not null or v_mcp_aud is not null then
    if v_issuer is null or v_web_client is null or v_mcp_client is null
       or v_web_aud is null or v_mcp_aud is null then
      raise exception 'All five Auth0 issuer/client/audience settings must be supplied together';
    end if;
    insert into private.auth_config(issuer, website_client_id, mcp_client_id, website_audience, mcp_audience)
      values (v_issuer, v_web_client, v_mcp_client, v_web_aud, v_mcp_aud);
  end if;
end;
$$;

create function private.has_audience(value jsonb, expected text)
returns boolean language sql immutable set search_path = '' as $$
  select case jsonb_typeof(value)
    when 'string' then value = to_jsonb(expected)
    when 'array' then value @> jsonb_build_array(expected)
      and not exists (select 1 from jsonb_array_elements(value) item where jsonb_typeof(item) <> 'string')
    else false end;
$$;
revoke all on function private.has_audience(jsonb, text) from public, anon, authenticated;

-- The only privileged operation here is reading private allowlists/revocations.
-- Signature/expiration verification belongs to Supabase's configured Auth0
-- integration. This repeats issuer, client, audience and capability checks in DB.
create function private.authorized_subject(require_write boolean default false)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  config private.auth_config%rowtype;
  subject text;
  scopes text[];
begin
  select * into config from private.auth_config where singleton;
  if not found or jsonb_typeof(claims) is distinct from 'object' then return null; end if;
  subject := claims->>'sub';
  if jsonb_typeof(claims->'sub') is distinct from 'string'
     or length(subject) not between 1 and 255 or btrim(subject) = ''
     or claims->>'iss' is distinct from config.issuer
     or claims->>'role' is distinct from 'authenticated'
     or claims->'https://livestocks.app/email_verified' is distinct from 'true'::jsonb
     or jsonb_typeof(claims->'scope') is distinct from 'string' then
    return null;
  end if;
  scopes := string_to_array(claims->>'scope', ' ');
  if not scopes @> array['portfolio:read']::text[] then return null; end if;
  if claims->>'azp' = config.website_client_id
     and private.has_audience(claims->'aud', config.website_audience)
     and claims->'https://livestocks.app/read_only' = 'false'::jsonb then
    if require_write and not scopes @> array['portfolio:write']::text[] then return null; end if;
    return subject;
  end if;
  if not require_write and claims->>'azp' = config.mcp_client_id
     and private.has_audience(claims->'aud', config.mcp_audience)
     and claims->'https://livestocks.app/read_only' = 'true'::jsonb
     and jsonb_typeof(claims->'iat') = 'number'
     and claims->>'iat' ~ '^[0-9]{1,16}$'
     and exists (select 1 from private.mcp_connections c
       where c.user_id = subject and c.enabled
         and (claims->>'iat')::bigint > c.valid_after) then
    return subject;
  end if;
  return null;
end;
$$;
revoke all on function private.authorized_subject(boolean) from public, anon;
grant execute on function private.authorized_subject(boolean) to authenticated;

-- Save a deterministic digest of every original business row before changing it.
create temporary table tenancy_before (table_name text primary key, row_count bigint, digest text) on commit drop;
do $$
declare t text;
begin
  foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
    execute format('insert into tenancy_before select %L, count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - %L)::text), '''' order by id), '''')) from public.%I r',
      t, case when t = 'settings' then 'finnhub_token' else '__no_legacy_column__' end, t);
  end loop;
end;
$$;

do $$
declare
  v_owner text := nullif(current_setting('app.legacy_owner_subject', true), '');
  v_encrypted text := nullif(current_setting('app.legacy_finnhub_encrypted', true), '');
  v_has_rows boolean := exists(select 1 from tenancy_before where row_count > 0);
  v_has_token boolean := exists(select 1 from public.settings where nullif(btrim(finnhub_token), '') is not null);
  t text;
begin
  if v_has_rows and (v_owner is null or length(v_owner) > 255 or btrim(v_owner) = '') then
    raise exception 'Legacy data requires an explicit externally verified app.legacy_owner_subject';
  end if;
  if v_has_token and (v_encrypted is null or btrim(v_encrypted) = '') then
    raise exception 'Legacy Finnhub token requires app.legacy_finnhub_encrypted before migration';
  end if;
  if v_has_rows then
    insert into public.user_profiles(id) values(v_owner);
  end if;
  if v_has_token then
    insert into private.user_credentials(user_id, encrypted_value) values(v_owner, v_encrypted);
    if not exists(select 1 from private.user_credentials where user_id = v_owner and encrypted_value = v_encrypted) then
      raise exception 'Legacy encrypted credential transfer failed';
    end if;
  end if;
  foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
    execute format('alter table public.%I add column user_id text', t);
    -- Disable only the known timestamp trigger; preserve all original timestamps.
    execute format('alter table public.%I disable trigger %I', t, 'set_' || t || '_updated_at');
    execute format('update public.%I set user_id = $1', t) using v_owner;
    execute format('alter table public.%I enable trigger %I', t, 'set_' || t || '_updated_at');
    execute format('alter table public.%I alter column user_id set default private.authorized_subject(true), alter column user_id set not null', t);
    execute format('alter table public.%I add constraint %I foreign key(user_id) references public.user_profiles(id) on delete restrict', t, t || '_user_id_fkey');
  end loop;
end;
$$;

-- Credentials never remain in an API-readable table or browser settings payload.
alter table public.settings drop column finnhub_token;
drop index public.settings_singleton_idx;
create unique index settings_user_id_idx on public.settings(user_id);
drop index public.positions_symbol_location_identity_idx;
create unique index positions_symbol_location_identity_idx
  on public.positions(user_id, (upper(btrim(symbol))), location);
alter table public.positions add constraint positions_id_user_id_key unique(id, user_id);
alter table public.watchlist_groups add constraint watchlist_groups_id_user_id_key unique(id, user_id);

alter table public.position_lots drop constraint position_lots_position_id_fkey;
alter table public.position_lots add constraint position_lots_position_owner_fkey
  foreign key(position_id, user_id) references public.positions(id, user_id) on delete cascade;
alter table public.position_plans drop constraint position_plans_position_id_fkey;
alter table public.position_plans add constraint position_plans_position_owner_fkey
  foreign key(position_id, user_id) references public.positions(id, user_id) on delete cascade;
alter table public.watchlist_tickers drop constraint watchlist_tickers_group_id_fkey;
alter table public.watchlist_tickers add constraint watchlist_tickers_group_owner_fkey
  foreign key(group_id, user_id) references public.watchlist_groups(id, user_id) on delete cascade;
create index position_lots_user_position_idx on public.position_lots(user_id, position_id);
create index position_plans_user_status_idx on public.position_plans(user_id, status);
create index watchlist_groups_user_id_idx on public.watchlist_groups(user_id);
create index watchlist_tickers_user_group_idx on public.watchlist_tickers(user_id, group_id);

create function private.prevent_owner_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501', message = 'Row ownership is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_owner_change() from public, anon, authenticated;

do $$
declare t text; p record; v_count bigint; v_digest text; baseline record;
begin
  foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Remove ALL existing policies: permissive policies combine with OR.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select private.authorized_subject(false)))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select private.authorized_subject(true)))', t);
    execute format('create policy owner_update on public.%I for update to authenticated using (user_id = (select private.authorized_subject(true))) with check (user_id = (select private.authorized_subject(true)))', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id = (select private.authorized_subject(true)))', t);
    execute format('create trigger prevent_owner_change before update of user_id on public.%I for each row execute function private.prevent_owner_change()', t);
    execute format('select count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - ''user_id'')::text), '''' order by id), '''')) from public.%I r', t)
      into v_count, v_digest;
    select * into strict baseline from tenancy_before where table_name = t;
    if v_count <> baseline.row_count or v_digest <> baseline.digest then
      raise exception 'Legacy row preservation verification failed for %', t;
    end if;
  end loop;
end;
$$;

revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy profile_read on public.user_profiles for select to authenticated
  using (id = (select private.authorized_subject(false)));
create policy profile_insert on public.user_profiles for insert to authenticated
  with check (id = (select private.authorized_subject(true)));
-- No API UPDATE/DELETE privilege: Auth0 subject/profile identity is immutable.

-- Keep request retry atomicity and position reuse, now within one verified owner.
create or replace function public.record_position_purchase(
  p_request_id uuid, p_symbol text, p_display text, p_image_url text,
  p_location public.position_location, p_price numeric, p_quantity numeric,
  p_executed_at date, p_has_commission boolean default false,
  p_commission_amount numeric default 0
)
returns table(position_id uuid, lot_id uuid, reused boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner text := private.authorized_subject(true);
  v_symbol text := upper(btrim(p_symbol));
  v_position_id uuid;
  v_reused boolean := false;
  v_existing public.position_lots%rowtype;
  v_position public.positions%rowtype;
  v_commission numeric := case when p_has_commission then p_commission_amount else 0 end;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'Authorized website write access is required';
  end if;
  if p_request_id is null or v_symbol is null or v_symbol = ''
     or nullif(btrim(p_display), '') is null or p_location is null
     or p_price is null or round(p_price, 4) <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
     or p_quantity is null or round(p_quantity, 4) <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity')
     or p_executed_at is null or not isfinite(p_executed_at)
     or p_has_commission is null or v_commission is null or v_commission < 0
     or v_commission::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'Invalid purchase details';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner || ':' || p_request_id::text, 0));
  select l.* into v_existing from public.position_lots l where l.id = p_request_id and l.user_id = v_owner;
  if found then
    select p.* into strict v_position from public.positions p
      where p.id = v_existing.position_id and p.user_id = v_owner;
    if upper(btrim(v_position.symbol)) <> v_symbol or v_position.location <> p_location
       or v_existing.side <> 'BUY' or v_existing.price <> round(p_price,4)
       or v_existing.quantity <> round(p_quantity,4) or v_existing.executed_at <> p_executed_at
       or v_existing.has_commission <> p_has_commission
       or v_existing.commission_amount <> round(v_commission,2) then
      raise exception using errcode = '22023', message = 'Purchase request ID was already used with different details';
    end if;
    return query select v_existing.position_id, v_existing.id, true;
    return;
  end if;
  insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date)
    values(v_owner,v_symbol,btrim(p_display),coalesce(p_image_url,''),p_location,p_price,p_quantity,p_executed_at)
    on conflict(user_id,(upper(btrim(symbol))),location) do nothing returning id into v_position_id;
  if v_position_id is null then
    v_reused := true;
    select p.* into strict v_position from public.positions p
      where p.user_id = v_owner and upper(btrim(p.symbol)) = v_symbol and p.location = p_location for update;
    v_position_id := v_position.id;
    if v_position.quantity > 0 and not exists(select 1 from public.position_lots l where l.position_id = v_position_id and l.user_id = v_owner) then
      insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
        values(v_owner,v_position_id,'BUY',v_position.entry_price,v_position.quantity,v_position.entry_date,false,0);
    end if;
  end if;
  insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
    values(p_request_id,v_owner,v_position_id,'BUY',p_price,p_quantity,p_executed_at,p_has_commission,v_commission);
  return query select v_position_id,p_request_id,v_reused;
end;
$$;
revoke all on function public.record_position_purchase(uuid,text,text,text,public.position_location,numeric,numeric,date,boolean,numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.record_position_purchase(uuid,text,text,text,public.position_location,numeric,numeric,date,boolean,numeric)
  to authenticated;

-- Public API entry points for the server's service-role client. The private
-- schema remains unexposed; all wrappers are invokers with explicit privileges.
create function public.server_get_credentials(p_user_id text)
returns text language sql security invoker set search_path = '' as $$
  select encrypted_value from private.user_credentials where user_id = p_user_id;
$$;
create function public.server_set_credentials(p_user_id text, p_encrypted_value text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_encrypted_value is null then
    delete from private.user_credentials where user_id = p_user_id;
  else
    insert into private.user_credentials(user_id, encrypted_value) values(p_user_id,p_encrypted_value)
      on conflict(user_id) do update set encrypted_value = excluded.encrypted_value, updated_at = now();
  end if;
end;
$$;

create function public.server_mcp_connection(p_user_id text, p_action text, p_valid_after bigint default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare connection private.mcp_connections%rowtype;
begin
  if p_valid_after is null or p_valid_after < 0 then raise exception 'Invalid connection cutoff'; end if;
  if p_action = 'get' then
    select * into connection from private.mcp_connections where user_id = p_user_id;
    if not found then return null; end if;
  elsif p_action = 'bootstrap' then
    insert into private.mcp_connections(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select * into strict connection from private.mcp_connections where user_id = p_user_id for update;
    if connection.enabled and p_valid_after > connection.valid_after then
      update private.mcp_connections set last_connected_at = now() where user_id = p_user_id returning * into connection;
    end if;
  elsif p_action = 'disconnect' then
    -- Create a disabled tombstone even if the first connection has not occurred.
    insert into private.mcp_connections(user_id,enabled,valid_after,revoked_at)
      values(p_user_id,false,p_valid_after,now())
      on conflict(user_id) do update set enabled = false, revoked_at = now(),
        valid_after = greatest(private.mcp_connections.valid_after,excluded.valid_after)
      returning * into connection;
  elsif p_action = 'reconnect' then
    -- Only the explicit website action may enable an existing disabled row.
    insert into private.mcp_connections(user_id,enabled,valid_after)
      values(p_user_id,true,p_valid_after)
      on conflict(user_id) do update set enabled = true, revoked_at = null, last_connected_at = null,
        valid_after = greatest(private.mcp_connections.valid_after,excluded.valid_after)
      returning * into connection;
  else
    raise exception 'Unknown connection action';
  end if;
  return to_jsonb(connection);
end;
$$;

create function public.server_widget_tokens(p_user_id text,p_action text,p_id uuid default null,p_name text default null,p_token_hash text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare widget private.widget_tokens%rowtype; result jsonb;
begin
  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(t) - 'token_hash' - 'user_id' order by t.created_at desc,t.id),'[]'::jsonb)
      into result from private.widget_tokens t where t.user_id = p_user_id;
    return result;
  elsif p_action = 'create' then
    insert into private.widget_tokens(user_id,token_hash,name,expires_at)
      values(p_user_id,p_token_hash,coalesce(nullif(btrim(p_name),''),'Widget'),now() + interval '90 days')
      returning * into widget;
  elsif p_action = 'revoke' then
    update private.widget_tokens set revoked_at = now() where id = p_id and user_id = p_user_id returning * into widget;
    if not found then return null; end if;
  else
    raise exception 'Unknown widget action';
  end if;
  return to_jsonb(widget) - 'token_hash' - 'user_id';
end;
$$;
create function public.server_resolve_widget(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare widget private.widget_tokens%rowtype;
begin
  update private.widget_tokens set last_used_at = now()
    where token_hash = p_token_hash and revoked_at is null and expires_at > now()
    returning * into widget;
  if not found then return null; end if;
  return jsonb_build_object('user_id',widget.user_id,'expires_at',widget.expires_at);
end;
$$;
revoke all on function public.server_get_credentials(text), public.server_set_credentials(text,text),
  public.server_mcp_connection(text,text,bigint), public.server_widget_tokens(text,text,uuid,text,text),
  public.server_resolve_widget(text) from public, anon, authenticated;
grant execute on function public.server_get_credentials(text), public.server_set_credentials(text,text),
  public.server_mcp_connection(text,text,bigint), public.server_widget_tokens(text,text,uuid,text,text),
  public.server_resolve_widget(text) to service_role;

commit;
