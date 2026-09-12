begin;
-- Test and live money never share balances, memberships, or settlement runs.
alter table public.ledger add column livemode boolean not null default true;
alter table public.enrollments add column livemode boolean not null default true;
alter table public.enrollments drop constraint enrollments_user_id_month_key;
alter table public.enrollments add unique(user_id,month,livemode);
alter table public.settlements add column livemode boolean not null default true;
alter table public.settlements drop constraint settlements_pkey;
alter table public.settlements add primary key(month,livemode);
create table public.billing_memberships (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 livemode boolean not null, customer_id text, subscription_id text unique,
 amount_cents integer not null check(amount_cents between 500 and 100000),
 status text not null default 'creating', cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index one_open_membership on public.billing_memberships(user_id,livemode)
 where status not in ('canceled','incomplete_expired');
create table public.billing_invoices (
 id text primary key, membership_id uuid not null references public.billing_memberships(id),
 payment_intent_id text not null unique, charge_id text not null unique,
 month date not null, amount_cents integer not null, fee_cents integer not null check(fee_cents>=0),
 paid_at timestamptz not null, available_at timestamptz not null,
 status text not null check(status in ('paid','review')), livemode boolean not null,
 unique(membership_id,month)
);
create table public.billing_events(id text primary key, livemode boolean not null, processed_at timestamptz not null default now());
create table public.payout_accounts(user_id uuid not null references public.profiles(id),livemode boolean not null,account_id text not null unique,primary key(user_id,livemode));
create table public.donation_recipients(id uuid primary key default gen_random_uuid(),name text not null,account_id text not null,livemode boolean not null,enabled boolean not null default false);
create table public.withdrawals (
 id uuid primary key, user_id uuid not null references public.profiles(id), livemode boolean not null,
 amount_cents bigint not null check(amount_cents>0), destination text not null,
 status text not null default 'reserved' check(status in ('reserved','transferred','review')),
 transfer_id text unique, created_at timestamptz not null default now()
);
-- Reuse an unresolved reservation rather than risking a second transfer after a timeout.
create unique index one_pending_withdrawal on public.withdrawals(user_id,livemode) where status in ('reserved','review');
alter table public.billing_memberships enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_events enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.donation_recipients enable row level security;
alter table public.withdrawals enable row level security;
revoke all on public.billing_memberships,public.billing_invoices,public.billing_events,public.payout_accounts,public.donation_recipients,public.withdrawals from anon,authenticated;
grant select on public.billing_memberships,public.withdrawals,public.donation_recipients to authenticated;
create policy own_memberships on public.billing_memberships for select to authenticated using(user_id=auth.uid());
create policy own_withdrawals on public.withdrawals for select to authenticated using(user_id=auth.uid());
create policy enabled_recipients on public.donation_recipients for select to authenticated using(enabled);
create function public.reserve_membership(member uuid,mode boolean,cents integer) returns public.billing_memberships
language plpgsql security definer set search_path='' as $$
declare r public.billing_memberships;
begin
 perform pg_advisory_xact_lock(hashtext(member::text),hashtext('membership:'||mode));
 select * into r from public.billing_memberships where user_id=member and livemode=mode and status not in ('canceled','incomplete_expired');
 if found then
   if r.amount_cents<>cents then raise exception 'Cancel the existing membership before choosing a different amount.'; end if;
   return r;
 end if;
 insert into public.billing_memberships(user_id,livemode,amount_cents) values(member,mode,cents) returning * into r;
 return r;
end $$;
create function public.record_paid_invoice(event_id text,mode boolean,membership uuid,invoice_id text,intent_id text,charge text,gross integer,fee integer,paid timestamptz,available timestamptz,issued timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare m public.billing_memberships; tz text; target date;
begin
 if exists(select 1 from public.billing_events where id=event_id) then return; end if;
 select * into strict m from public.billing_memberships where id=membership and livemode=mode for update;
 if gross<>m.amount_cents or fee<0 or fee>gross then raise exception 'Invoice amount mismatch'; end if;
 select timezone into strict tz from public.profiles where id=m.user_id;
 target:=(date_trunc('month',issued at time zone tz)+interval '1 month')::date;
 if exists(select 1 from public.settlements where month=target and livemode=mode) then raise exception 'Month already settled'; end if;
 insert into public.billing_invoices values(invoice_id,m.id,intent_id,charge,target,gross,fee,paid,available,case when (paid at time zone tz)::date<target then 'paid' else 'review' end,mode)
 on conflict(id) do nothing;
 if (paid at time zone tz)::date<target then
   insert into public.enrollments(user_id,month,contribution_cents,timezone,payment_reference,paid_at,livemode)
   values(m.user_id,target,gross,tz,invoice_id,paid,mode) on conflict(payment_reference) do nothing;
 end if;
 insert into public.billing_events(id,livemode) values(event_id,mode) on conflict do nothing;
end $$;
create function public.reserve_withdrawal(member uuid,mode boolean,cents bigint,destination_id text,request_id uuid) returns public.withdrawals
language plpgsql security definer set search_path='' as $$
declare r public.withdrawals; funds bigint;
begin
 perform pg_advisory_xact_lock(hashtext(member::text),hashtext('withdrawal:'||mode));
 select * into r from public.withdrawals where user_id=member and livemode=mode and status in ('reserved','review');
 if found then return r; end if;
 select * into r from public.withdrawals where id=request_id;
 if found then
   if r.user_id<>member or r.livemode<>mode then raise exception 'Invalid request'; end if;
   return r;
 end if;
 if exists(select 1 from public.billing_invoices where livemode=mode and status='review') then raise exception 'Payouts await payment review'; end if;
 if cents<=0 then raise exception 'Invalid amount'; end if;
 if not exists(select 1 from public.payout_accounts where user_id=member and livemode=mode and account_id=destination_id)
 and not exists(select 1 from public.donation_recipients where enabled and livemode=mode and account_id=destination_id) then raise exception 'Unverified recipient'; end if;
 select coalesce(sum(amount_cents),0) into funds from public.ledger where user_id=member and livemode=mode;
 if funds<cents then raise exception 'Insufficient balance'; end if;
 insert into public.withdrawals(id,user_id,livemode,amount_cents,destination) values(request_id,member,mode,cents,destination_id) returning * into r;
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode) values(member,-cents,'Withdrawal reserved', 'withdrawal:'||request_id,mode);
 return r;
end $$;
-- Disable the legacy gross-pool settlement; callers must use fee-aware settlement.
revoke execute on function public.settle_month(date) from service_role;
create function public.settle_net_month(target_month date,mode boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare net bigint; weight numeric; fees bigint; forfeited bigint; required integer;
begin
 if extract(day from target_month)<>1 then raise exception 'First day required'; end if;
 perform pg_advisory_xact_lock(hashtext('levav-settle:'||mode),hashtext(target_month::text));
 if exists(select 1 from public.settlements where month=target_month and livemode=mode) then return '{"status":"already_settled"}'; end if;
 perform 1 from public.enrollments where month=target_month and livemode=mode for update;
 if not found then raise exception 'No paid enrollments'; end if;
 if exists(select 1 from public.enrollments where month=target_month and livemode=mode and (now() at time zone timezone)::date<(target_month+interval '1 month')::date) then raise exception 'Month still active'; end if;
 if exists(select 1 from public.enrollments e left join public.billing_invoices i on i.id=e.payment_reference where e.month=target_month and e.livemode=mode and (i.id is null or i.status<>'paid' or i.available_at>now())) then raise exception 'Payments await reconciliation'; end if;
 if exists(select 1 from public.checkins c join public.enrollments e on e.user_id=c.user_id where e.month=target_month and e.livemode=mode and c.checkin_date>=target_month and c.checkin_date<target_month+interval '1 month' and c.review_status='pending') then raise exception 'Photo review pending'; end if;
 select count(*) into required from generate_series(target_month::timestamp,target_month+interval '1 month'-interval '1 day',interval '1 day') d where extract(dow from d)<>6;
 create temporary table net_work on commit drop as select e.user_id,e.contribution_cents,
 (select count(*) from public.checkins c where c.user_id=e.user_id and c.checkin_date>=target_month and c.checkin_date<target_month+interval '1 month' and extract(dow from c.checkin_date)<>6 and c.review_status='approved')=required as completed
 from public.enrollments e where e.month=target_month and e.livemode=mode;
 select sum(contribution_cents) filter(where completed),coalesce(sum(contribution_cents) filter(where not completed),0) into weight,forfeited from net_work;
 if coalesce(weight,0)=0 then raise exception 'No finishers: rollover decision required'; end if;
 select sum(i.fee_cents) into fees from public.billing_invoices i join public.enrollments e on e.payment_reference=i.id where e.month=target_month and e.livemode=mode;
 select sum(contribution_cents)-fees into net from net_work;
 if net<=0 then raise exception 'No net funds'; end if;
 with raw as(select user_id,floor(net*contribution_cents::numeric/weight)::bigint as base,mod(net*contribution_cents::numeric,weight) as remainder from net_work where completed),
 ranked as(select *,row_number() over(order by remainder desc,user_id) as rank,net-sum(base) over() as leftover from raw)
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
 select user_id,base+case when rank<=leftover then 1 else 0 end,'Monthly pool after processing fees','net-settlement:'||mode||':'||target_month||':'||user_id,mode from ranked where base+case when rank<=leftover then 1 else 0 end>0;
 insert into public.settlements(month,forfeited_cents,livemode) values(target_month,forfeited,mode);
 update public.enrollments set settled_at=now() where month=target_month and livemode=mode;
 drop table net_work;
 return jsonb_build_object('status','settled','fees_cents',fees,'distributed_cents',net);
end $$;
revoke all on function public.reserve_membership(uuid,boolean,integer),public.record_paid_invoice(text,boolean,uuid,text,text,text,integer,integer,timestamptz,timestamptz,timestamptz),public.reserve_withdrawal(uuid,boolean,bigint,text,uuid),public.settle_net_month(date,boolean) from public,anon,authenticated;
grant execute on function public.reserve_membership(uuid,boolean,integer),public.record_paid_invoice(text,boolean,uuid,text,text,text,integer,integer,timestamptz,timestamptz,timestamptz),public.reserve_withdrawal(uuid,boolean,bigint,text,uuid),public.settle_net_month(date,boolean) to service_role;
commit;
