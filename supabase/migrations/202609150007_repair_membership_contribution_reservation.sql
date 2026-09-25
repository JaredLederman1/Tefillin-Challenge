begin;

-- Some environments received the `contribution_cents` column before the
-- four-argument reservation function.  The old function inserts only
-- `amount_cents`, which now violates this column's NOT NULL constraint before
-- Stripe PaymentSheet can be initialized.  Make the schema and function
-- convergent so this migration is safe for both states.
alter table public.billing_memberships
  add column if not exists contribution_cents integer,
  add column if not exists covers_stripe_fee boolean not null default false;

update public.billing_memberships
set contribution_cents = amount_cents
where contribution_cents is null;

alter table public.billing_memberships
  alter column contribution_cents set not null;

alter table public.billing_memberships
  drop constraint if exists billing_memberships_contribution_cents_check;

alter table public.billing_memberships
  add constraint billing_memberships_contribution_cents_check
  check (contribution_cents between 180 and 1800);

-- `amount_cents` is the amount charged; `contribution_cents` is the selected
-- challenge contribution.  Keep both values in every new reservation.
create or replace function public.reserve_membership(
  member uuid,
  mode boolean,
  cents integer,
  covers_fee boolean
) returns public.billing_memberships
language plpgsql security definer set search_path='' as $$
declare
  reservation public.billing_memberships;
  charged integer;
begin
  if cents < 180 or cents > 1800 then
    raise exception 'Choose $1.80–$18.';
  end if;

  charged := case
    when covers_fee then ceil((cents + 30)::numeric / .97)::integer
    else cents
  end;

  perform pg_advisory_xact_lock(hashtext(member::text), hashtext('membership:' || mode));

  select * into reservation
  from public.billing_memberships
  where user_id = member
    and livemode = mode
    and status not in ('canceled', 'incomplete_expired');

  if found then
    if reservation.amount_cents <> charged
      or reservation.contribution_cents <> cents
      or reservation.covers_stripe_fee <> covers_fee then
      raise exception 'Cancel the existing membership before changing your contribution.';
    end if;
    return reservation;
  end if;

  insert into public.billing_memberships(
    user_id,
    livemode,
    amount_cents,
    contribution_cents,
    covers_stripe_fee
  ) values (
    member,
    mode,
    charged,
    cents,
    covers_fee
  ) returning * into reservation;

  return reservation;
end;
$$;

revoke all on function public.reserve_membership(uuid, boolean, integer, boolean)
  from public, anon;
grant execute on function public.reserve_membership(uuid, boolean, integer, boolean)
  to service_role;

commit;
