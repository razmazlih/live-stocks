-- Synthetic, disposable database only. This file is not an application migration.
create schema auth;
alter database postgres set search_path to auth, public;
create schema private;
revoke all on schema private from public;
create table private.gate_client (
  singleton boolean primary key default true check (singleton),
  approved_client_id uuid not null
);

-- Model the proposed fixed-client hook faithfully: the real client ID is
-- registered by the local probe, and ordinary website tokens remain unchanged.
create function public.gate_access_token(event jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare claims jsonb := event->'claims';
begin
  if exists (
    select 1 from private.gate_client c
    where c.approved_client_id::text = claims->>'client_id'
  ) then
    claims := jsonb_set(claims, '{aud}',
      '["authenticated","https://razmaz-live-stocks.vercel.app/api/mcp"]');
    claims := jsonb_set(claims, '{read_only}', 'true');
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.gate_access_token(jsonb) from public;
-- The disposable Auth process runs as its disposable database's postgres owner.
grant execute on function public.gate_access_token(jsonb) to postgres;
