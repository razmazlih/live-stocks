alter table public.position_plans
  add column if not exists has_commission boolean not null default true;

alter table public.position_plans
  add column if not exists commission_amount numeric(12,2) not null default 8;

update public.position_plans
set has_commission = true
where has_commission is null;

update public.position_plans
set commission_amount = 8
where commission_amount is null;

alter table public.position_plans
  drop constraint if exists position_plans_commission_amount_non_negative;

alter table public.position_plans
  add constraint position_plans_commission_amount_non_negative
  check (commission_amount >= 0);
