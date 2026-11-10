-- One instrument per account, including positions whose lots have been sold.
-- Stop for manual review instead of silently merging or deleting historical data.
do $$
begin
  if exists (
    select 1 from public.positions
    group by upper(btrim(symbol)), location having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Duplicate position identities require review before this migration can run',
      hint = 'Inspect positions grouped by upper(btrim(symbol)), location. Preserve all lots and plans when resolving duplicates.';
  end if;
end;
$$;

create unique index positions_symbol_location_identity_idx
  on public.positions ((upper(btrim(symbol))), location);

-- The caller's UUID is also the BUY lot ID. Retrying an uncertain response does
-- not record another purchase. All operations participate in the same transaction.
create or replace function public.record_position_purchase(
  p_request_id uuid,
  p_symbol text,
  p_display text,
  p_image_url text,
  p_location public.position_location,
  p_price numeric,
  p_quantity numeric,
  p_executed_at date,
  p_has_commission boolean default false,
  p_commission_amount numeric default 0
)
returns table (position_id uuid, lot_id uuid, reused boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_symbol text := upper(btrim(p_symbol));
  v_position_id uuid;
  v_reused boolean := false;
  v_existing public.position_lots%rowtype;
  v_position public.positions%rowtype;
  v_commission numeric := case when p_has_commission then p_commission_amount else 0 end;
begin
  if p_request_id is null or v_symbol is null or v_symbol = ''
     or nullif(btrim(p_display), '') is null or p_location is null
     or p_price is null or round(p_price, 4) <= 0 or p_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_quantity is null or round(p_quantity, 4) <= 0 or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or p_executed_at is null or not isfinite(p_executed_at)
     or p_has_commission is null or v_commission is null or v_commission < 0
     or v_commission::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22023', message = 'Invalid purchase details';
  end if;

  -- Serialize retries even when a UUID is accidentally reused for another symbol.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select l.* into v_existing from public.position_lots l where l.id = p_request_id;
  if found then
    select p.* into v_position from public.positions p where p.id = v_existing.position_id;
    if upper(btrim(v_position.symbol)) <> v_symbol or v_position.location <> p_location
       or v_existing.side <> 'BUY' or v_existing.price <> round(p_price, 4)
       or v_existing.quantity <> round(p_quantity, 4) or v_existing.executed_at <> p_executed_at
       or v_existing.has_commission <> p_has_commission
       or v_existing.commission_amount <> round(v_commission, 2) then
      raise exception using errcode = '22023', message = 'Purchase request ID was already used with different details';
    end if;
    return query select v_existing.position_id, v_existing.id, true;
    return;
  end if;

  insert into public.positions (symbol, display, image_url, location, entry_price, quantity, entry_date)
  values (v_symbol, btrim(p_display), coalesce(p_image_url, ''), p_location, p_price, p_quantity, p_executed_at)
  on conflict ((upper(btrim(symbol))), location) do nothing
  returning id into v_position_id;

  if v_position_id is null then
    v_reused := true;
    select p.* into strict v_position from public.positions p
      where upper(btrim(p.symbol)) = v_symbol and p.location = p_location
      for update;
    v_position_id := v_position.id;

    -- Old/imported rows may carry a holding without lots. Preserve that opening
    -- balance before appending, rather than making its quantity disappear.
    if v_position.quantity > 0 and not exists (
      select 1 from public.position_lots l where l.position_id = v_position_id
    ) then
      insert into public.position_lots (position_id, side, price, quantity, executed_at, has_commission, commission_amount)
      values (v_position_id, 'BUY', v_position.entry_price, v_position.quantity, v_position.entry_date, false, 0);
    end if;
  end if;

  insert into public.position_lots (id, position_id, side, price, quantity, executed_at, has_commission, commission_amount)
  values (p_request_id, v_position_id, 'BUY', p_price, p_quantity, p_executed_at, p_has_commission, v_commission);

  return query select v_position_id, p_request_id, v_reused;
end;
$$;

-- Match the existing application's table access; the function does not bypass RLS.
revoke all on function public.record_position_purchase(uuid, text, text, text, public.position_location, numeric, numeric, date, boolean, numeric) from public;
grant execute on function public.record_position_purchase(uuid, text, text, text, public.position_location, numeric, numeric, date, boolean, numeric) to anon, authenticated, service_role;
