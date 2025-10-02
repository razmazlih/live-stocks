-- Ensure UUID generation is available
create extension if not exists "pgcrypto";

-- Create positions table for tracking stock holdings
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  display text not null,
  image_url text not null,
  entry_price numeric(18,4) not null,
  quantity numeric(18,4) not null,
  entry_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists positions_symbol_idx on public.positions (symbol);

-- Keep updated_at in sync on changes
create or replace function public.set_positions_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_positions_updated_at on public.positions;
create trigger set_positions_updated_at
  before update on public.positions
  for each row
  execute function public.set_positions_updated_at();

alter table public.positions enable row level security;

drop policy if exists "Allow public select on positions" on public.positions;
create policy "Allow public select on positions"
  on public.positions
  for select
  using (true);

drop policy if exists "Allow public insert on positions" on public.positions;
create policy "Allow public insert on positions"
  on public.positions
  for insert
  with check (true);

drop policy if exists "Allow public update on positions" on public.positions;
create policy "Allow public update on positions"
  on public.positions
  for update
  using (true)
  with check (true);

drop policy if exists "Allow public delete on positions" on public.positions;
create policy "Allow public delete on positions"
  on public.positions
  for delete
  using (true);

-- Create settings table for global app configuration
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  annual_growth_rate numeric(6,4) not null default 0.0500,
  currency text not null default 'USD',
  refresh_interval integer not null default 15,
  finnhub_token text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Maintain single-row semantics by ensuring only one row exists
create unique index if not exists settings_singleton_idx on public.settings ((true));

create or replace function public.set_settings_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at
  before update on public.settings
  for each row
  execute function public.set_settings_updated_at();

alter table public.settings enable row level security;

drop policy if exists "Allow public select on settings" on public.settings;
create policy "Allow public select on settings"
  on public.settings
  for select
  using (true);

drop policy if exists "Allow public upsert on settings" on public.settings;
create policy "Allow public upsert on settings"
  on public.settings
  for all
  using (true)
  with check (true);
