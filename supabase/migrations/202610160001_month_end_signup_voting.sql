begin;
-- Vote on the final New York calendar day for the month just completed.
-- Round keys retain the next-month convention to preserve historical votes.
create or replace function public.charity_vote_window_open(target date,at_time timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select extract(day from target)=1
  and at_time >= ((target-interval '1 day') at time zone 'America/New_York')
  and at_time < (target::timestamp at time zone 'America/New_York');
$$;
revoke all on function public.charity_vote_window_open(date,timestamptz) from public,anon,authenticated;
grant execute on function public.charity_vote_window_open(date,timestamptz) to service_role;

-- Shorten only open rounds. Preserve every accepted vote and closed report.
update public.charity_vote_rounds
set closes_at=least(closes_at,month::timestamp at time zone 'America/New_York')
where status='open';

create or replace function public.ensure_charity_vote_round() returns date
language plpgsql security definer set search_path='' as $$
declare target date := (date_trunc('month',now() at time zone 'America/New_York')+interval '1 month')::date;
begin
 perform pg_advisory_xact_lock(hashtext('charity-vote:'||target));
 insert into public.charity_vote_rounds(month,closes_at) values(target,target::timestamp at time zone 'America/New_York') on conflict do nothing;
 if not exists(select 1 from public.charity_vote_candidates where month=target) then
  insert into public.charity_vote_candidates(month,cause_id,tie_rank)
  select target,id,row_number() over(order by rotation,id)::integer from (
   select id,mod((row_number() over(order by name,id)-1+extract(year from target)::integer*12+extract(month from target)::integer),count(*) over()) rotation
   from public.donation_causes where enabled and livemode=true
  ) c order by rotation,id limit 3;
 end if;
 perform public.process_due_settlements();
 return target;
end $$;

create or replace function public.configure_charity_vote_round(target date,causes uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare candidate uuid; position integer:=0;
begin
 if target<=date_trunc('month',now() at time zone 'America/New_York')::date or extract(day from target)<>1 then raise exception 'Only future months can be configured'; end if;
 if cardinality(causes)<1 or cardinality(causes)>6 or cardinality(causes)<>(select count(distinct c) from unnest(causes) c) then raise exception 'Choose 1–6 distinct candidates'; end if;
 perform pg_advisory_xact_lock(hashtext('charity-vote:'||target));
 if exists(select 1 from unnest(causes) c where not exists(select 1 from public.donation_causes d where d.id=c and d.enabled and d.livemode)) then raise exception 'Choose enabled live charities'; end if;
 insert into public.charity_vote_rounds(month,closes_at) values(target,target::timestamp at time zone 'America/New_York') on conflict do nothing;
 if exists(select 1 from public.charity_votes where month=target) then raise exception 'Votes already exist'; end if;
 delete from public.charity_vote_candidates where month=target;
 foreach candidate in array causes loop
  position:=position+1;
  insert into public.charity_vote_candidates(month,cause_id,tie_rank) values(target,candidate,position);
 end loop;
end $$;

create or replace function public.charity_vote_completion(p_member uuid,p_voting_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare qualification date:=(p_voting_month-interval '1 month')::date;
 member_tz text; local_today date; joined date; starts date; ends date:=(p_voting_month-1); required integer; completed integer; pending integer; missing integer;
begin
 select timezone into member_tz from public.profiles where id=p_member;
 if member_tz is null then raise exception 'Member profile is unavailable'; end if;
 if extract(day from p_voting_month)<>1 then raise exception 'First day required'; end if;
 local_today:=(now() at time zone member_tz)::date;
 select (created_at at time zone member_tz)::date into joined from auth.users where id=p_member;
 if joined is null then raise exception 'Member signup date is unavailable'; end if;
 starts:=greatest(qualification,joined);
 select count(*)::integer,
  count(*) filter(where c.review_status='approved' and c.checkin_date<=local_today)::integer,
  count(*) filter(where c.review_status='pending' and c.checkin_date<=local_today)::integer
 into required,completed,pending
 from generate_series(starts::timestamp,p_voting_month::timestamp-interval '1 day',interval '1 day') d
 left join public.checkins c on c.user_id=p_member and c.checkin_date=d::date
 where public.is_required_wrap_day(d::date);
 missing:=required-completed-pending;
 return jsonb_build_object('qualificationMonth',qualification,
  'qualificationStart',starts,'qualificationEnd',ends,
  'completionEligible',local_today>=ends and required>0 and completed=required,
  'qualificationMonthEnded',local_today>=p_voting_month,
  'requiredDays',required,'completedDays',completed,'pendingReviewDays',pending,'missingDays',missing);
end $$;

create or replace function public.charity_vote_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare target date; completion jsonb; subscribed boolean; window_open boolean; round_open boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 target:=public.ensure_charity_vote_round();
 completion:=public.charity_vote_completion(auth.uid(),target);
 window_open:=public.charity_vote_window_open(target,now());
 round_open:=exists(select 1 from public.charity_vote_rounds where month=target and status='open' and closes_at>now());
 subscribed:=exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now());
 return completion||jsonb_build_object('month',target,'closesAt',(select closes_at from public.charity_vote_rounds where month=target),'status',(select status from public.charity_vote_rounds where month=target),
 'voteCauseId',(select cause_id from public.charity_votes where month=target and user_id=auth.uid()),
 'subscriptionEligible',subscribed,
 'eligible',window_open and round_open and subscribed and (completion->>'completionEligible')::boolean,
 'votingWindowOpen',window_open,
 'opensAt',(target-interval '1 day') at time zone 'America/New_York',
 'budgetCents',(select budget_cents from public.charity_vote_rounds where month=target),
 'subscriberCount',(select subscriber_count from public.charity_vote_rounds where month=target),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.cause_id,'name',d.name,'description',d.description,'websiteUrl',d.website_url,'tieRank',c.tie_rank,'votes',(select count(*) from public.charity_votes v where v.month=target and v.cause_id=c.cause_id)) order by c.tie_rank) from public.charity_vote_candidates c join public.donation_causes d on d.id=c.cause_id where c.month=target),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(r order by r.month desc) from (select v.month,d.name as recipient,v.donation_cents as "donationCents",v.donated_at as "donatedAt",v.receipt_url as "receiptUrl" from public.charity_vote_rounds v join public.donation_causes d on d.id=v.winner_cause_id where v.status='closed' order by v.month desc limit 12) r),'[]'::jsonb));
end $$;


create or replace function public.cast_charity_vote(cause uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target date; completion jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 target:=(date_trunc('month',now() at time zone 'America/New_York')+interval '1 month')::date;
 if not public.charity_vote_window_open(target,now()) then raise exception 'Voting is available only on the last day of the month in New York time'; end if;
 target:=public.ensure_charity_vote_round();
 perform 1 from public.charity_vote_rounds where month=target and status='open' and closes_at>now() for update;
 if not found then raise exception 'Voting has closed'; end if;
 if not exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now()) then raise exception 'An active subscription is required to vote'; end if;
 completion:=public.charity_vote_completion(auth.uid(),target);
 if (completion->>'pendingReviewDays')::integer>0 and (completion->>'missingDays')::integer=0 then raise exception 'Your required wraps are awaiting approval'; end if;
 if not (completion->>'completionEligible')::boolean then raise exception 'Complete every obligated wrap day since signup in the qualifying month to vote'; end if;
 if not exists(select 1 from public.charity_vote_candidates where month=target and cause_id=cause) then raise exception 'Choose a current candidate'; end if;
 insert into public.charity_votes(month,user_id,cause_id) values(target,auth.uid(),cause);
exception when unique_violation then raise exception 'Your vote has already been recorded';
end $$;

revoke all on function public.ensure_charity_vote_round(),public.configure_charity_vote_round(date,uuid[]) from public,anon,authenticated;
grant execute on function public.ensure_charity_vote_round(),public.configure_charity_vote_round(date,uuid[]) to service_role;
revoke all on function public.charity_vote_status(),public.cast_charity_vote(uuid) from public,anon;
grant execute on function public.charity_vote_status(),public.cast_charity_vote(uuid) to authenticated;
commit;
