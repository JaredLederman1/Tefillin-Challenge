begin;

-- `amount_cents` remains the amount charged by Stripe. Keep the intended
-- contribution separately so the optional fee cover is transparent to members.
alter table public.billing_memberships
  add column if not exists contribution_cents integer,
  add column if not exists covers_stripe_fee boolean not null default false;
update public.billing_memberships
set contribution_cents=amount_cents
where contribution_cents is null;
alter table public.billing_memberships
  alter column contribution_cents set not null,
  add constraint billing_memberships_contribution_cents_check check(contribution_cents between 180 and 1800) not valid;
alter table public.billing_memberships validate constraint billing_memberships_contribution_cents_check;

-- When a member covers fees, calculate a charge whose net is at least their
-- selected contribution using the disclosed 30¢ + 3% fee schedule.
create or replace function public.reserve_membership(member uuid,mode boolean,cents integer,covers_fee boolean) returns public.billing_memberships
language plpgsql security definer set search_path='' as $$
declare r public.billing_memberships; charged integer;
begin
 if cents<180 or cents>1800 then raise exception 'Choose $1.80–$18.'; end if;
 charged:=case when covers_fee then ceil((cents+30)::numeric/.97)::integer else cents end;
 perform pg_advisory_xact_lock(hashtext(member::text),hashtext('membership:'||mode));
 select * into r from public.billing_memberships where user_id=member and livemode=mode and status not in ('canceled','incomplete_expired');
 if found then
   if r.amount_cents<>charged or r.contribution_cents<>cents or r.covers_stripe_fee<>covers_fee then raise exception 'Cancel the existing membership before changing your contribution.'; end if;
   return r;
 end if;
 insert into public.billing_memberships(user_id,livemode,amount_cents,contribution_cents,covers_stripe_fee)
 values(member,mode,charged,cents,covers_fee) returning * into r;
 return r;
end $$;
revoke all on function public.reserve_membership(uuid,boolean,integer,boolean) from public,anon;
grant execute on function public.reserve_membership(uuid,boolean,integer,boolean) to service_role;

-- The wallet and challenge weights are always the actual post-fee amount.
create or replace function public.record_paid_invoice(event_id text,mode boolean,membership uuid,invoice_id text,intent_id text,charge text,gross integer,fee integer,paid timestamptz,available timestamptz,issued timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare m public.billing_memberships; tz text; target date; net integer;
begin
 if exists(select 1 from public.billing_events where id=event_id) then return; end if;
 select * into strict m from public.billing_memberships where id=membership and livemode=mode for update;
 if gross<>m.amount_cents or fee<0 or fee>gross then raise exception 'Invoice amount mismatch'; end if;
 net:=greatest(0,gross-fee);
 select timezone into strict tz from public.profiles where id=m.user_id;
 target:=(date_trunc('month',issued at time zone tz)+interval '1 month')::date;
 if exists(select 1 from public.settlements where month=target and livemode=mode) then raise exception 'Month already settled'; end if;
 insert into public.billing_invoices values(invoice_id,m.id,intent_id,charge,target,gross,fee,paid,available,case when (paid at time zone tz)::date<target then 'paid' else 'review' end,mode) on conflict(id) do nothing;
 if (paid at time zone tz)::date<target then
   insert into public.enrollments(user_id,month,contribution_cents,timezone,payment_reference,paid_at,livemode)
   values(m.user_id,target,net,tz,invoice_id,paid,mode) on conflict(payment_reference) do nothing;
   insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
   values(m.user_id,net,'Monthly contribution after Stripe fees','contribution:'||invoice_id,mode) on conflict(external_id) do nothing;
 end if;
 insert into public.billing_events(id,livemode) values(event_id,mode) on conflict do nothing;
end $$;

-- Enrollments now store net contributions, so do not deduct invoice fees a
-- second time during redistribution.
create or replace function public.settle_net_month(target_month date,mode boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare net bigint; fees bigint; forfeited bigint; required integer;
begin
 if extract(day from target_month)<>1 then raise exception 'First day required'; end if;
 perform pg_advisory_xact_lock(hashtext('levav-settle:'||mode),hashtext(target_month::text));
 if exists(select 1 from public.settlements where month=target_month and livemode=mode) then return '{"status":"already_settled"}'; end if;
 perform 1 from public.enrollments where month=target_month and livemode=mode for update;
 if not found then raise exception 'No paid enrollments'; end if;
 if exists(select 1 from public.enrollments where month=target_month and livemode=mode and (now() at time zone timezone)::date<(target_month+interval '1 month')::date) then raise exception 'Month still active'; end if;
 if exists(select 1 from public.enrollments e left join public.billing_invoices i on i.id=e.payment_reference and i.livemode=e.livemode where e.month=target_month and e.livemode=mode and (i.id is null or i.status<>'paid' or i.available_at>now())) then raise exception 'Payments await reconciliation'; end if;
 select count(*) into required from generate_series(target_month::timestamp,target_month+interval '1 month'-interval '1 day',interval '1 day') d where extract(dow from d)<>6;
 create temporary table net_work on commit drop as
 select e.user_id,e.contribution_cents,
 (select count(*) from public.checkins c where c.user_id=e.user_id and c.checkin_date>=target_month and c.checkin_date<target_month+interval '1 month' and extract(dow from c.checkin_date)<>6 and c.review_status='approved')=required as completed
 from public.enrollments e where e.month=target_month and e.livemode=mode;
 if not exists(select 1 from net_work where completed) then raise exception 'No finishers: rollover decision required'; end if;
 select sum(contribution_cents) into net from net_work;
 select coalesce(sum(i.fee_cents),0) into fees from public.billing_invoices i join public.enrollments e on e.payment_reference=i.id and e.livemode=i.livemode where e.month=target_month and e.livemode=mode;
 select coalesce(sum(contribution_cents) filter(where not completed),0) into forfeited from net_work;
 with raw as(select user_id,floor(net*contribution_cents::numeric/(select sum(contribution_cents) from net_work where completed))::bigint as base,mod(net*contribution_cents::numeric,(select sum(contribution_cents) from net_work where completed)) as remainder from net_work where completed), ranked as(select *,row_number() over(order by remainder desc,user_id) as rank,net-sum(base) over() as leftover from raw), payouts as(select w.user_id,w.contribution_cents,coalesce(r.base+case when r.rank<=r.leftover then 1 else 0 end,0) as payout from net_work w left join ranked r on r.user_id=w.user_id)
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
 select user_id,payout-contribution_cents,case when payout>contribution_cents then 'Monthly redistribution · gain' else 'Monthly redistribution · loss' end,'net-settlement:'||mode||':'||target_month||':'||user_id,mode from payouts where payout<>contribution_cents on conflict(external_id) do nothing;
 insert into public.settlements(month,forfeited_cents,livemode) values(target_month,forfeited,mode);
 update public.enrollments set settled_at=now() where month=target_month and livemode=mode;
 drop table net_work;
 return jsonb_build_object('status','settled','fees_cents',fees,'distributed_cents',net);
end $$;

commit;
