begin;

-- Show each paid contribution in the member wallet immediately. The unique
-- external id keeps Stripe webhook retries from creating a duplicate credit.
create or replace function public.record_paid_invoice(event_id text,mode boolean,membership uuid,invoice_id text,intent_id text,charge text,gross integer,fee integer,paid timestamptz,available timestamptz,issued timestamptz) returns void
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
   insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
   values(m.user_id,gross,'Monthly contribution','contribution:'||invoice_id,mode)
   on conflict(external_id) do nothing;
 end if;
 insert into public.billing_events(id,livemode) values(event_id,mode) on conflict do nothing;
end $$;

-- Reconcile already-paid contributions created before the immediate-wallet entry.
insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
select e.user_id,e.contribution_cents,'Monthly contribution','contribution:'||e.payment_reference,e.livemode
from public.enrollments e
join public.billing_invoices i on i.id=e.payment_reference and i.livemode=e.livemode
where i.status='paid'
on conflict(external_id) do nothing;

create or replace function public.settle_net_month(target_month date,mode boolean) returns jsonb
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
 with raw as(
   select user_id,floor(net*contribution_cents::numeric/weight)::bigint as base,mod(net*contribution_cents::numeric,weight) as remainder from net_work where completed
 ), ranked as(
   select *,row_number() over(order by remainder desc,user_id) as rank,net-sum(base) over() as leftover from raw
 ), payouts as(
   select w.user_id,w.contribution_cents,coalesce(r.base+case when r.rank<=r.leftover then 1 else 0 end,0) as payout
   from net_work w left join ranked r on r.user_id=w.user_id
 )
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode)
 select user_id,payout-contribution_cents,
   case when payout>contribution_cents then 'Monthly redistribution · gain' else 'Monthly redistribution · loss' end,
   'net-settlement:'||mode||':'||target_month||':'||user_id,mode
 from payouts where payout<>contribution_cents
 on conflict(external_id) do nothing;
 insert into public.settlements(month,forfeited_cents,livemode) values(target_month,forfeited,mode);
 update public.enrollments set settled_at=now() where month=target_month and livemode=mode;
 drop table net_work;
 return jsonb_build_object('status','settled','fees_cents',fees,'distributed_cents',net);
end $$;

commit;
