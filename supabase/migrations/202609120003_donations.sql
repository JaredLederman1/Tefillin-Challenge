begin;
-- Retain historical payout records, but remove access to the retired reservation path.
revoke execute on function public.reserve_withdrawal(uuid,boolean,bigint,text,uuid) from service_role;
create table public.donation_causes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 livemode boolean not null, enabled boolean not null default false,
 featured_month date check(featured_month=date_trunc('month',featured_month)::date)
);
create table public.donation_requests (
 id uuid primary key, user_id uuid not null references public.profiles(id), livemode boolean not null,
 cause_id uuid not null references public.donation_causes(id), cause_name text not null,
 amount_cents bigint not null check(amount_cents>0), status text not null default 'pending' check(status in ('pending','fulfilled','canceled')),
 created_at timestamptz not null default now(), resolved_at timestamptz, fulfillment_reference text,
 check((status='pending' and resolved_at is null) or (status<>'pending' and resolved_at is not null)),
 check(status<>'fulfilled' or length(trim(fulfillment_reference))>0 and fulfillment_reference is not null)
);
alter table public.donation_causes enable row level security;
alter table public.donation_requests enable row level security;
revoke all on public.donation_causes,public.donation_requests from anon,authenticated;
grant select on public.donation_causes,public.donation_requests to authenticated;
create policy available_causes on public.donation_causes for select to authenticated using(enabled);
create policy own_donations on public.donation_requests for select to authenticated using(user_id=auth.uid());
create function public.request_donation(member uuid,mode boolean,cause uuid,request_id uuid,expected_cents bigint) returns public.donation_requests
language plpgsql security definer set search_path='' as $$
declare r public.donation_requests; c public.donation_causes; funds bigint;
begin
 -- Same lock as the retired withdrawal path so in-flight reservations cannot race.
 perform pg_advisory_xact_lock(hashtext(member::text),hashtext('withdrawal:'||mode));
 select * into r from public.donation_requests where id=request_id;
 if found then
  if r.user_id<>member or r.livemode<>mode or r.cause_id<>cause or r.amount_cents<>expected_cents then raise exception 'Request mismatch';end if;
  return r;
 end if;
 select * into c from public.donation_causes where id=cause and livemode=mode and enabled and (featured_month is null or featured_month=date_trunc('month',now() at time zone 'America/New_York')::date) for share;
 if not found then raise exception 'Choose an available cause';end if;
 if exists(select 1 from public.billing_invoices where livemode=mode and status='review') then raise exception 'Funds are awaiting payment review';end if;
 if exists(select 1 from public.withdrawals where user_id=member and livemode=mode and status in ('reserved','review')) then raise exception 'Previous payout requires reconciliation';end if;
 select coalesce(sum(amount_cents),0) into funds from public.ledger where user_id=member and livemode=mode;
 if funds<=0 or funds<>expected_cents then raise exception 'Balance changed. Refresh before donating';end if;
 insert into public.donation_requests(id,user_id,livemode,cause_id,cause_name,amount_cents) values(request_id,member,mode,cause,c.name,funds) returning * into r;
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode) values(member,-funds,'Donation requested · '||c.name,'donation:'||request_id,mode);
 return r;
end $$;
create function public.resolve_donation(request_id uuid,outcome text,reference text) returns public.donation_requests
language plpgsql security definer set search_path='' as $$
declare r public.donation_requests;
begin
 select * into r from public.donation_requests where id=request_id;
 if not found then raise exception 'Donation not found';end if;
 perform pg_advisory_xact_lock(hashtext(r.user_id::text),hashtext('withdrawal:'||r.livemode));
 select * into r from public.donation_requests where id=request_id for update;
 if outcome not in ('fulfilled','canceled') or outcome is null then raise exception 'Invalid outcome';end if;
 if r.status=outcome then return r;end if;
 if r.status<>'pending' then raise exception 'Donation already resolved';end if;
 if reference is null or length(trim(reference))=0 then raise exception 'Receipt reference or cancellation reason required';end if;
 if outcome='canceled' then
  insert into public.ledger(user_id,amount_cents,description,external_id,livemode) values(r.user_id,r.amount_cents,'Donation canceled · '||r.cause_name,'donation-return:'||request_id,r.livemode);
 end if;
 update public.donation_requests set status=outcome,resolved_at=now(),fulfillment_reference=reference where id=request_id returning * into r;
 return r;
end $$;
revoke all on function public.request_donation(uuid,boolean,uuid,uuid,bigint),public.resolve_donation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_donation(uuid,boolean,uuid,uuid,bigint),public.resolve_donation(uuid,text,text) to service_role;
commit;
