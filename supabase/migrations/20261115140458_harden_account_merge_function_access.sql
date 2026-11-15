-- The canonical merge function's default PUBLIC EXECUTE survived a revoke issued
-- without inherited owner privileges on managed Postgres. Only the server may
-- prepare an already-authorized merge.
-- No account, financial row, timestamp, credential or existing pinned migration is changed.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- Managed postgres has SET but not INHERIT on the executor. Act as the exact
-- function owner so REVOKE cannot merely warn and leave the old PUBLIC grant.
set local role livestocks_merge_executor;
revoke all on function public.server_merge_prepare(uuid,text,text)
  from public, anon, authenticated, livestocks_auth_backend;
grant execute on function public.server_merge_prepare(uuid,text,text) to service_role;
reset role;

-- These legacy trigger bodies use only NEW, current_user and pg_catalog functions.
-- Pin their lookup context without replacing their timestamp-preservation logic.
alter function public.set_position_lots_updated_at() set search_path = '';
alter function public.set_position_plans_updated_at() set search_path = '';
alter function public.set_positions_updated_at() set search_path = '';
alter function public.set_settings_updated_at() set search_path = '';
alter function public.set_watchlist_groups_updated_at() set search_path = '';
alter function public.set_watchlist_tickers_updated_at() set search_path = '';

do $assert_access$
declare actor text;
begin
  foreach actor in array array['anon','authenticated','livestocks_auth_backend'] loop
    if has_function_privilege(actor,'public.server_merge_prepare(uuid,text,text)','EXECUTE') then
      raise exception 'Merge preparation must remain server-only';
    end if;
  end loop;
  if not has_function_privilege('service_role','public.server_merge_prepare(uuid,text,text)','EXECUTE') then
    raise exception 'Server merge preparation grant is missing';
  end if;
end;
$assert_access$;
commit;
