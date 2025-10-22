create table if not exists public.position_plans (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references public.positions(id) on delete cascade,
  symbol text not null,
  display text,
  image_url text,
  target_price numeric(18,4) not null,
  target_quantity numeric(18,4) not null,
  target_date date not null,
  status text not null check (status in ('pending','triggered','expired','cancelled')) default 'pending',
  triggered_at date,
  expired_at date,
  executed_price numeric(18,4),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists position_plans_position_id_idx on public.position_plans(position_id);
create index if not exists position_plans_status_idx on public.position_plans(status);
create index if not exists position_plans_target_date_idx on public.position_plans(target_date);

create or replace function public.set_position_plans_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_position_plans_updated_at on public.position_plans;
create trigger set_position_plans_updated_at
  before update on public.position_plans
  for each row
  execute function public.set_position_plans_updated_at();

alter table public.position_plans enable row level security;

drop policy if exists "Allow public read position plans" on public.position_plans;
create policy "Allow public read position plans"
  on public.position_plans
  for select
  using (true);

drop policy if exists "Allow public write position plans" on public.position_plans;
create policy "Allow public write position plans"
  on public.position_plans
  for all
  using (true)
  with check (true);
