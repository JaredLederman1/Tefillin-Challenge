begin;
-- Preserve historical financial records; no new personal funds are created.
alter table public.billing_memberships add column if not exists access_expires_at timestamptz;
create table public.app_subscription_transactions (
 transaction_id text primary key,
 original_transaction_id text not null,
 user_id uuid references public.profiles(id) on delete set null,
 environment text not null,
 purchased_at timestamptz not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.app_subscription_transactions enable row level security;
revoke all on public.app_subscription_transactions from anon, authenticated;

create function public.record_app_subscription(member uuid,original_id text,transaction_id text,environment text,purchased timestamptz,expires timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare m public.billing_memberships;
begin
 if expires<=now() then raise exception 'Subscription expired'; end if;
 perform pg_advisory_xact_lock(hashtext(original_id));
 perform pg_advisory_xact_lock(hashtext(member::text),hashtext('membership:true'));
 if exists(select 1 from public.billing_memberships where subscription_id=original_id and user_id<>member)
 or exists(select 1 from public.app_subscription_transactions t where t.transaction_id=record_app_subscription.transaction_id and t.user_id<>member) then raise exception 'Subscription belongs to another account'; end if;
 update public.billing_memberships set status='canceled' where user_id=member and livemode=true and access_expires_at<=now() and subscription_id not like 'sub_%';
 select * into m from public.billing_memberships where user_id=member and livemode=true and status not in ('canceled','incomplete_expired') for update;
 if found and m.subscription_id is not null and m.subscription_id<>original_id then raise exception 'Another subscription is already active'; end if;
 if m.id is null then
  select * into m from public.billing_memberships where subscription_id=original_id and user_id=member for update;
 end if;
 if m.id is null then
  -- Legacy amount columns retained for schema compatibility, never credited to a wallet.
  insert into public.billing_memberships(user_id,livemode,amount_cents,contribution_cents,status,subscription_id,access_expires_at)
  values(member,true,180,180,'active',original_id,expires) returning * into m;
 else
  update public.billing_memberships set status='active',subscription_id=original_id,access_expires_at=greatest(access_expires_at,expires),cancel_at_period_end=false where id=m.id;
 end if;
 insert into public.app_subscription_transactions(transaction_id,original_transaction_id,user_id,environment,purchased_at,expires_at)
 values(transaction_id,original_id,member,environment,purchased,expires) on conflict on constraint app_subscription_transactions_pkey do update set user_id=excluded.user_id;
end $$;
revoke all on function public.record_app_subscription(uuid,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.record_app_subscription(uuid,text,text,text,timestamptz,timestamptz) to service_role;

-- Legacy Stripe renewals are retained for accounting without enrolling or crediting users.
create or replace function public.record_paid_invoice(event_id text,mode boolean,membership uuid,invoice_id text,intent_id text,charge text,gross integer,fee integer,paid timestamptz,available timestamptz,issued timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare m public.billing_memberships;
begin
 select * into strict m from public.billing_memberships where id=membership and livemode=mode for update;
 if gross<>m.amount_cents or fee<0 or fee>gross then raise exception 'Invoice amount mismatch'; end if;
 insert into public.billing_invoices(id,membership_id,payment_intent_id,charge_id,month,amount_cents,fee_cents,paid_at,available_at,status,livemode)
 values(invoice_id,m.id,intent_id,charge,(date_trunc('month',issued at time zone 'America/New_York')+interval '1 month')::date,gross,fee,paid,available,'paid',mode) on conflict do nothing;
 insert into public.billing_events(id,livemode) values(event_id,mode) on conflict do nothing;
end $$;
create or replace function public.settle_net_month(target_month date,mode boolean) returns jsonb
language plpgsql security definer set search_path='' as $$ begin return '{"status":"retired"}'::jsonb; end $$;
create or replace function public.process_due_settlements() returns void
language plpgsql security definer set search_path='' as $$ begin return; end $$;
revoke all on function public.reserve_membership(uuid,boolean,integer),public.reserve_membership(uuid,boolean,integer,boolean),public.request_donation(uuid,boolean,uuid,uuid,bigint),public.reserve_withdrawal(uuid,boolean,bigint,text,uuid),public.set_charity_preference(uuid,boolean),public.set_tefillin_goal(boolean) from public,anon,authenticated,service_role;

-- Some deployed environments include an older Apple wallet-credit RPC.
-- Discover its signature so upgrading never leaves a callable legacy route.
do $$ declare legacy record; begin
 for legacy in select p.proname,pg_get_function_identity_arguments(p.oid) arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_apple_purchase' loop
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',legacy.proname,legacy.arguments);
 end loop;
end $$;

create table public.charity_vote_rounds (
 month date primary key check(extract(day from month)=1),
 closes_at timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),
 winner_cause_id uuid references public.donation_causes(id),
 donation_cents bigint check(donation_cents>=0),
 donated_at timestamptz,
 receipt_url text check(receipt_url is null or receipt_url ~ '^https://'),
 unique(month,winner_cause_id)
);
create table public.charity_vote_candidates (
 month date not null references public.charity_vote_rounds(month),
 cause_id uuid not null references public.donation_causes(id),
 tie_rank integer not null check(tie_rank>0),
 primary key(month,cause_id), unique(month,tie_rank)
);
create table public.charity_votes (
 month date not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 cause_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(month,user_id),
 foreign key(month,cause_id) references public.charity_vote_candidates(month,cause_id)
);
alter table public.charity_vote_rounds enable row level security;
alter table public.charity_vote_candidates enable row level security;
alter table public.charity_votes enable row level security;
revoke all on public.charity_vote_rounds,public.charity_vote_candidates,public.charity_votes from anon,authenticated;
grant select on public.charity_vote_rounds,public.charity_vote_candidates to authenticated;
grant all on public.app_subscription_transactions,public.charity_vote_rounds,public.charity_vote_candidates,public.charity_votes to service_role;
create policy member_rounds on public.charity_vote_rounds for select to authenticated using(true);
create policy member_candidates on public.charity_vote_candidates for select to authenticated using(true);

-- Monthly slate rotates three existing charities. Operators can replace future slates
-- with service-role SQL before they open. Never change a slate after voting begins.
create function public.ensure_charity_vote_round() returns date
language plpgsql security definer set search_path='' as $$
declare target date := date_trunc('month',now() at time zone 'America/New_York')::date;
begin
 perform pg_advisory_xact_lock(hashtext('charity-vote:'||target));
 insert into public.charity_vote_rounds(month,closes_at) values(target,(target+interval '1 month') at time zone 'America/New_York') on conflict do nothing;
 if not exists(select 1 from public.charity_vote_candidates where month=target) then
  insert into public.charity_vote_candidates(month,cause_id,tie_rank)
  select target,id,row_number() over(order by rotation,id)::integer from (
   select id,mod((row_number() over(order by name,id)-1+extract(year from target)::integer*12+extract(month from target)::integer),count(*) over()) rotation
   from public.donation_causes where enabled and livemode=true
  ) c order by rotation,id limit 3;
 end if;
 return target;
end $$;
create function public.charity_vote_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare target date;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 target:=public.ensure_charity_vote_round();
 return jsonb_build_object('month',target,'closesAt',(select closes_at from public.charity_vote_rounds where month=target),'status',(select status from public.charity_vote_rounds where month=target),
 'voteCauseId',(select cause_id from public.charity_votes where month=target and user_id=auth.uid()),
 'eligible',exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now()),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.cause_id,'name',d.name,'description',d.description,'websiteUrl',d.website_url,'tieRank',c.tie_rank,'votes',(select count(*) from public.charity_votes v where v.month=target and v.cause_id=c.cause_id)) order by c.tie_rank) from public.charity_vote_candidates c join public.donation_causes d on d.id=c.cause_id where c.month=target),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(r order by r.month desc) from (select v.month,d.name as recipient,v.donation_cents as "donationCents",v.donated_at as "donatedAt",v.receipt_url as "receiptUrl" from public.charity_vote_rounds v join public.donation_causes d on d.id=v.winner_cause_id where v.status='closed' order by v.month desc limit 12) r),'[]'::jsonb));
end $$;
create function public.cast_charity_vote(cause uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target date;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 target:=public.ensure_charity_vote_round();
 perform 1 from public.charity_vote_rounds where month=target and status='open' and closes_at>now() for update;
 if not found then raise exception 'Voting has closed'; end if;
 if not exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now()) then raise exception 'An active subscription is required to vote'; end if;
 if not exists(select 1 from public.charity_vote_candidates where month=target and cause_id=cause) then raise exception 'Choose a current candidate'; end if;
 insert into public.charity_votes(month,user_id,cause_id) values(target,auth.uid(),cause);
exception when unique_violation then raise exception 'Your vote has already been recorded';
end $$;
-- Operator closes the round; winner is computed, never supplied by the client.
-- Highest vote count wins; ties (including zero votes) use published slate order.
create function public.close_charity_vote_round(target date) returns uuid
language plpgsql security definer set search_path='' as $$
declare winner uuid; round public.charity_vote_rounds;
begin
 select * into strict round from public.charity_vote_rounds where month=target for update;
 if round.status='closed' then return round.winner_cause_id; end if;
 if round.closes_at>now() then raise exception 'Voting is still open'; end if;
 select c.cause_id into winner from public.charity_vote_candidates c left join public.charity_votes v on v.month=c.month and v.cause_id=c.cause_id where c.month=target group by c.cause_id,c.tie_rank order by count(v.user_id) desc,c.tie_rank limit 1;
 if winner is null then raise exception 'No candidates'; end if;
 update public.charity_vote_rounds set status='closed',winner_cause_id=winner where month=target;
 return winner;
end $$;
revoke all on function public.ensure_charity_vote_round(),public.charity_vote_status(),public.cast_charity_vote(uuid),public.close_charity_vote_round(date) from public,anon,authenticated;
grant execute on function public.charity_vote_status(),public.cast_charity_vote(uuid) to authenticated;
grant execute on function public.close_charity_vote_round(date),public.ensure_charity_vote_round() to service_role;
-- Service-role operating endpoints, never available to mobile clients.
create function public.configure_charity_vote_round(target date,causes uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare candidate uuid; position integer:=0;
begin
 if target<=date_trunc('month',now() at time zone 'America/New_York')::date or extract(day from target)<>1 then raise exception 'Only future months can be configured'; end if;
 if cardinality(causes)<1 or cardinality(causes)>6 or cardinality(causes)<>(select count(distinct c) from unnest(causes) c) then raise exception 'Choose 1–6 distinct candidates'; end if;
 perform pg_advisory_xact_lock(hashtext('charity-vote:'||target));
 if exists(select 1 from unnest(causes) c where not exists(select 1 from public.donation_causes d where d.id=c and d.enabled and d.livemode)) then raise exception 'Choose enabled live charities'; end if;
 insert into public.charity_vote_rounds(month,closes_at) values(target,(target+interval '1 month') at time zone 'America/New_York') on conflict do nothing;
 if exists(select 1 from public.charity_votes where month=target) then raise exception 'Votes already exist'; end if;
 delete from public.charity_vote_candidates where month=target;
 foreach candidate in array causes loop
  position:=position+1;
  insert into public.charity_vote_candidates(month,cause_id,tie_rank) values(target,candidate,position);
 end loop;
end $$;
create function public.publish_company_donation(target date,cents bigint,fulfilled timestamptz,receipt text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if cents<0 or cents is null or fulfilled is null or fulfilled>now() or receipt is null or receipt !~ '^https://' then raise exception 'Provide actual reconciled cents, fulfillment date and HTTPS confirmation'; end if;
 update public.charity_vote_rounds set donation_cents=cents,donated_at=fulfilled,receipt_url=receipt where month=target and status='closed';
 if not found then raise exception 'Close the vote before publishing confirmation'; end if;
end $$;
revoke all on function public.configure_charity_vote_round(date,uuid[]),public.publish_company_donation(date,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.configure_charity_vote_round(date,uuid[]),public.publish_company_donation(date,bigint,timestamptz,text) to service_role;
commit;
