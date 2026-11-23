begin;
create table private.quote_stream_feeds (
  scope text primary key, owner_node uuid, lease_until timestamptz,
  status text not null default 'connecting', marks jsonb not null default '{}',
  socket_after timestamptz, rest_after timestamptz, rest_cursor integer not null default 0,
  active_at timestamptz not null default clock_timestamp()
);
create table private.quote_stream_nodes (
  scope text not null references private.quote_stream_feeds on delete cascade,
  node_id uuid not null, demand jsonb not null, expires_at timestamptz not null,
  primary key (scope, node_id)
);
create index quote_stream_feeds_active_at on private.quote_stream_feeds(active_at);
revoke all on private.quote_stream_feeds, private.quote_stream_nodes from public, anon, authenticated;

-- A request holds row locks only for this transaction. This works with the
-- existing HTTP service-role client and transaction-mode database pooling.
create function public.server_quote_stream_step(
  p_scope text, p_node uuid, p_demand jsonb, p_marks jsonb, p_status text, p_release boolean default false,
  p_backoff integer default 0, p_wants_socket boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f private.quote_stream_feeds%rowtype;
  time_now timestamptz := clock_timestamp();
  symbols text[] := '{}';
  fallback_symbols text[];
  rest_symbol text;
  elected boolean;
  allow_socket boolean := false;
  fresh jsonb;
begin
  if p_scope !~ '^[a-f0-9]{64}$' or p_node is null or jsonb_typeof(p_demand) <> 'array'
    or jsonb_array_length(p_demand) > 150 or jsonb_typeof(p_marks) <> 'object'
    or p_backoff < 0 or octet_length(p_marks::text) > 45000 then raise exception 'Invalid quote coordination request'; end if;
  delete from private.quote_stream_feeds where scope in (
    select scope from private.quote_stream_feeds where active_at < time_now - interval '15 minutes'
    order by active_at limit 16 for update skip locked
  );
  insert into private.quote_stream_feeds(scope) values(p_scope) on conflict do nothing;
  select * into strict f from private.quote_stream_feeds where scope=p_scope for update;
  delete from private.quote_stream_nodes where scope=p_scope and expires_at <= time_now;
  if p_release then
    delete from private.quote_stream_nodes where scope=p_scope and node_id=p_node;
    update private.quote_stream_feeds set owner_node=null, lease_until=null, status='connecting'
      where scope=p_scope and owner_node=p_node;
    return '{}'::jsonb;
  end if;
  insert into private.quote_stream_nodes values (p_scope, p_node, p_demand, time_now + interval '13 seconds')
    on conflict(scope,node_id) do update set demand=excluded.demand, expires_at=excluded.expires_at;

  select coalesce(array_agg(s order by priority,s),'{}'::text[]) into symbols from (
    select x->>'symbol' s, min((x->>'priority')::int) priority
    from private.quote_stream_nodes n cross join lateral jsonb_array_elements(n.demand) x
    where n.scope=p_scope and x->>'symbol' ~ '^[A-Z][A-Z0-9]{0,9}([.-][A-Z0-9]{1,4})?$'
    group by 1 order by 2,1 limit 150
  ) ranked;
  -- Only the previously fenced owner may publish. A claimant cannot publish
  -- stale trade data in the same call that takes an expired lease.
  if f.owner_node=p_node and f.lease_until > time_now then
    select coalesce(jsonb_object_agg(k,v),'{}') into fresh from jsonb_each(p_marks) q(k,v)
    where k=any(symbols) and v->>'symbol'=k and jsonb_typeof(v->'timestamp')='number'
      and (v->>'timestamp')::bigint >= floor(extract(epoch from time_now - interval '15 minutes')*1000)
      and (v->>'timestamp')::bigint <= ceil(extract(epoch from time_now)*1000)
      and ((v->>'timestamp')::bigint > coalesce((f.marks->k->>'timestamp')::bigint,0)
        or ((v->>'timestamp')::bigint = (f.marks->k->>'timestamp')::bigint
          and f.marks->k->>'source' = 'quote' and v->>'source' = 'trade'));
    f.marks := f.marks || fresh;
    if p_backoff > 0 then
      f.rest_after := greatest(f.rest_after, time_now + make_interval(secs => least(p_backoff,3600)));
      f.socket_after := greatest(f.socket_after, time_now + make_interval(secs => least(p_backoff,3600)));
    end if;
    if p_status in ('connecting','streaming','fallback','unavailable','closed') then f.status := p_status; end if;
  end if;
  elected := f.owner_node is null or f.owner_node=p_node or f.lease_until <= time_now;
  if elected then
    if f.owner_node is distinct from p_node then f.status := 'connecting'; end if;
    f.owner_node := p_node;
    f.lease_until := time_now + interval '10 seconds';
    if p_wants_socket and (f.socket_after is null or f.socket_after <= time_now) then
      allow_socket := true;
      f.socket_after := time_now + interval '10 seconds';
    end if;
    if f.status in ('streaming','fallback') and (f.rest_after is null or f.rest_after <= time_now) then
      -- One permit per six seconds PER KEY across all functions. Rotate
      -- through symbols with no recent mark, including subscription overflow.
      select array_agg(s order by ord) into fallback_symbols
      from unnest(symbols) with ordinality wanted(s,ord)
      where coalesce((f.marks->s->>'timestamp')::bigint,0) < extract(epoch from time_now - interval '60 seconds')*1000;
      if cardinality(fallback_symbols)>0 then
        rest_symbol := fallback_symbols[1 + (f.rest_cursor % cardinality(fallback_symbols))];
        f.rest_cursor := (f.rest_cursor + 1) % 100000;
        f.rest_after := time_now + interval '6 seconds';
      end if;
    end if;
  end if;
  select coalesce(jsonb_object_agg(k,v),'{}') into f.marks from jsonb_each(f.marks) q(k,v)
    where k=any(symbols) and (v->>'timestamp')::bigint >= extract(epoch from time_now - interval '15 minutes')*1000;
  update private.quote_stream_feeds set owner_node=f.owner_node,lease_until=f.lease_until,
    marks=f.marks,status=f.status,socket_after=f.socket_after,rest_cursor=f.rest_cursor,rest_after=f.rest_after,active_at=time_now
    where scope=p_scope;
  return jsonb_build_object('leader',elected,'allowSocket',allow_socket,'symbols',symbols[1:50],'restSymbol',rest_symbol,'status',f.status,'marks',f.marks);
end $$;
revoke all on function public.server_quote_stream_step(text,uuid,jsonb,jsonb,text,boolean,integer,boolean) from public, anon, authenticated;
grant execute on function public.server_quote_stream_step(text,uuid,jsonb,jsonb,text,boolean,integer,boolean) to service_role;
commit;
