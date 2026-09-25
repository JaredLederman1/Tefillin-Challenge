begin;

alter table public.billing_memberships
  drop constraint if exists billing_memberships_amount_cents_check;
alter table public.billing_memberships
  add constraint billing_memberships_amount_cents_check
  check (amount_cents between 100 and 100000);

alter table public.profiles
  drop constraint if exists profiles_contribution_cents_check;
alter table public.profiles
  add constraint profiles_contribution_cents_check
  check (contribution_cents between 100 and 100000);

commit;
