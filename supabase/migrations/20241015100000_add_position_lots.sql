create table if not exists public.position_lots (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  side text not null check (side in ('BUY', 'SELL')),
  price numeric(18,4) not null,
  quantity numeric(18,4) not null,
  executed_at date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists position_lots_position_id_idx on public.position_lots(position_id);
create index if not exists position_lots_executed_at_idx on public.position_lots(executed_at);

create or replace function public.set_position_lots_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_position_lots_updated_at on public.position_lots;
create trigger set_position_lots_updated_at
  before update on public.position_lots
  for each row
  execute function public.set_position_lots_updated_at();

alter table public.position_lots enable row level security;

drop policy if exists "Allow public read position lots" on public.position_lots;
create policy "Allow public read position lots"
  on public.position_lots
  for select
  using (true);

drop policy if exists "Allow public write position lots" on public.position_lots;
create policy "Allow public write position lots"
  on public.position_lots
  for all
  using (true)
  with check (true);

insert into public.position_lots (position_id, side, price, quantity, executed_at)
select p.id, 'BUY', p.entry_price, p.quantity, p.entry_date
from public.positions p
where p.quantity > 0
  and not exists (
    select 1
    from public.position_lots lots
    where lots.position_id = p.id
  );
