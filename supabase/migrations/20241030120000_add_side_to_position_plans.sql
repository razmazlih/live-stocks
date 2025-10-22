alter table public.position_plans
  add column if not exists side text;

update public.position_plans
set side = coalesce(side, 'buy');

alter table public.position_plans
  alter column side set default 'buy';

alter table public.position_plans
  alter column side set not null;

alter table public.position_plans
  drop constraint if exists position_plans_side_check;

alter table public.position_plans
  add constraint position_plans_side_check check (side in ('buy','sell'));
