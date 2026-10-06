begin;
-- Private audit of reconciled totals allocated to a voting round. These are
-- company funds, never member balances or inferred subscription proceeds.
create table public.company_donation_fund_records (
 id bigint generated always as identity primary key,
 month date not null references public.charity_vote_rounds(month),
 available_cents bigint not null check(available_cents>=0),
 recorded_at timestamptz not null default now()
);
alter table public.company_donation_fund_records enable row level security;
revoke all on public.company_donation_fund_records from public,anon,authenticated;
grant select on public.company_donation_fund_records to service_role;

create function public.record_company_donation_funds(target date,cents bigint)
returns void language plpgsql security definer set search_path='' as $$
declare fulfilled timestamptz;
begin
 if target is null or extract(day from target)<>1 or cents is null or cents<0 or cents>9007199254740991 then
  raise exception 'Provide a voting month and actual reconciled nonnegative cents';
 end if;
 select donated_at into fulfilled from public.charity_vote_rounds where month=target for update;
 if not found then raise exception 'Initialize the voting round first'; end if;
 if fulfilled is not null then raise exception 'Donation has already been fulfilled'; end if;
 insert into public.company_donation_fund_records(month,available_cents) values(target,cents);
 update public.charity_vote_rounds set budget_cents=cents where month=target;
end $$;
revoke all on function public.record_company_donation_funds(date,bigint) from public,anon,authenticated;
grant execute on function public.record_company_donation_funds(date,bigint) to service_role;
commit;
