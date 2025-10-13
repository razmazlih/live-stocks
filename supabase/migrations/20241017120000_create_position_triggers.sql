create table if not exists public.position_triggers (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  ts timestamptz not null default timezone('utc', now()),
  items jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists position_triggers_symbol_idx on public.position_triggers (symbol, ts desc);

alter table public.position_triggers enable row level security;

drop policy if exists "Allow public select on position_triggers" on public.position_triggers;
create policy "Allow public select on position_triggers"
  on public.position_triggers
  for select
  using (true);

drop policy if exists "Allow public insert on position_triggers" on public.position_triggers;
create policy "Allow public insert on position_triggers"
  on public.position_triggers
  for insert
  with check (true);

