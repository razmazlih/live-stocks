-- Watchlist groups for organizing tracked tickers
create table if not exists public.watchlist_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists watchlist_groups_name_idx on public.watchlist_groups using gin (to_tsvector('simple', name));

create or replace function public.set_watchlist_groups_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_watchlist_groups_updated_at on public.watchlist_groups;
create trigger set_watchlist_groups_updated_at
  before update on public.watchlist_groups
  for each row
  execute function public.set_watchlist_groups_updated_at();

-- Individual tickers that belong to a group
create table if not exists public.watchlist_tickers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.watchlist_groups(id) on delete cascade,
  symbol text not null,
  display text,
  image_url text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists watchlist_tickers_group_idx on public.watchlist_tickers (group_id, sort_order, created_at);
create index if not exists watchlist_tickers_symbol_idx on public.watchlist_tickers (symbol);

create or replace function public.set_watchlist_tickers_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_watchlist_tickers_updated_at on public.watchlist_tickers;
create trigger set_watchlist_tickers_updated_at
  before update on public.watchlist_tickers
  for each row
  execute function public.set_watchlist_tickers_updated_at();

alter table public.watchlist_groups enable row level security;
alter table public.watchlist_tickers enable row level security;

-- Local development policies allow full access
drop policy if exists "Allow public select on watchlist_groups" on public.watchlist_groups;
create policy "Allow public select on watchlist_groups"
  on public.watchlist_groups
  for select
  using (true);

drop policy if exists "Allow public insert on watchlist_groups" on public.watchlist_groups;
create policy "Allow public insert on watchlist_groups"
  on public.watchlist_groups
  for insert
  with check (true);

drop policy if exists "Allow public update on watchlist_groups" on public.watchlist_groups;
create policy "Allow public update on watchlist_groups"
  on public.watchlist_groups
  for update
  using (true)
  with check (true);

drop policy if exists "Allow public delete on watchlist_groups" on public.watchlist_groups;
create policy "Allow public delete on watchlist_groups"
  on public.watchlist_groups
  for delete
  using (true);

drop policy if exists "Allow public select on watchlist_tickers" on public.watchlist_tickers;
create policy "Allow public select on watchlist_tickers"
  on public.watchlist_tickers
  for select
  using (true);

drop policy if exists "Allow public insert on watchlist_tickers" on public.watchlist_tickers;
create policy "Allow public insert on watchlist_tickers"
  on public.watchlist_tickers
  for insert
  with check (true);

drop policy if exists "Allow public update on watchlist_tickers" on public.watchlist_tickers;
create policy "Allow public update on watchlist_tickers"
  on public.watchlist_tickers
  for update
  using (true)
  with check (true);

drop policy if exists "Allow public delete on watchlist_tickers" on public.watchlist_tickers;
create policy "Allow public delete on watchlist_tickers"
  on public.watchlist_tickers
  for delete
  using (true);
