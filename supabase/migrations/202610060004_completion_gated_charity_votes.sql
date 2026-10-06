begin;
-- Budget fields stay unset until the company commitment is approved. Adding
-- these fields does not promise funds or create a personal monetary balance.
alter table public.charity_vote_rounds
 add column if not exists budget_cents bigint check(budget_cents>=0),
 add column if not exists subscriber_count integer check(subscriber_count>=0);

-- Calendar qualification is independent of paid app access. A November vote
-- requires the full October calendar month, using the existing server policy.
create function public.charity_vote_completion(p_member uuid,p_voting_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare qualification date:=(p_voting_month-interval '1 month')::date;
 member_tz text; local_today date; required integer; completed integer; pending integer; missing integer;
begin
 select timezone into member_tz from public.profiles where id=p_member;
 if member_tz is null then raise exception 'Member profile is unavailable'; end if;
 if extract(day from p_voting_month)<>1 then raise exception 'First day required'; end if;
 local_today:=(now() at time zone member_tz)::date;
 select count(*)::integer,
  count(*) filter(where c.review_status='approved' and c.checkin_date<=local_today)::integer,
  count(*) filter(where c.review_status='pending' and c.checkin_date<=local_today)::integer
 into required,completed,pending
 from generate_series(qualification::timestamp,p_voting_month::timestamp-interval '1 day',interval '1 day') d
 left join public.checkins c on c.user_id=p_member and c.checkin_date=d::date
 where public.is_required_wrap_day(d::date);
 missing:=required-completed-pending;
 return jsonb_build_object('qualificationMonth',qualification,
  'completionEligible',local_today>=p_voting_month and required>0 and completed=required,
  'qualificationMonthEnded',local_today>=p_voting_month,
  'requiredDays',required,'completedDays',completed,'pendingReviewDays',pending,'missingDays',missing);
end $$;
revoke all on function public.charity_vote_completion(uuid,date) from public,anon,authenticated;
grant execute on function public.charity_vote_completion(uuid,date) to service_role;

create or replace function public.charity_vote_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare target date; completion jsonb; subscribed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 target:=public.ensure_charity_vote_round();
 completion:=public.charity_vote_completion(auth.uid(),target);
 subscribed:=exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now());
 return completion||jsonb_build_object('month',target,'closesAt',(select closes_at from public.charity_vote_rounds where month=target),'status',(select status from public.charity_vote_rounds where month=target),
 'voteCauseId',(select cause_id from public.charity_votes where month=target and user_id=auth.uid()),
 'subscriptionEligible',subscribed,
 'eligible',subscribed and (completion->>'completionEligible')::boolean,
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
 target:=public.ensure_charity_vote_round();
 perform 1 from public.charity_vote_rounds where month=target and status='open' and closes_at>now() for update;
 if not found then raise exception 'Voting has closed'; end if;
 if not exists(select 1 from public.billing_memberships where user_id=auth.uid() and livemode and status='active' and access_expires_at>now()) then raise exception 'An active subscription is required to vote'; end if;
 completion:=public.charity_vote_completion(auth.uid(),target);
 if not (completion->>'qualificationMonthEnded')::boolean then raise exception 'Voting unlocks after the previous month ends in your timezone'; end if;
 if (completion->>'pendingReviewDays')::integer>0 and (completion->>'missingDays')::integer=0 then raise exception 'Your previous month wraps are awaiting approval'; end if;
 if not (completion->>'completionEligible')::boolean then raise exception 'Complete every required wrap day in the previous calendar month to vote'; end if;
 if not exists(select 1 from public.charity_vote_candidates where month=target and cause_id=cause) then raise exception 'Choose a current candidate'; end if;
 insert into public.charity_votes(month,user_id,cause_id) values(target,auth.uid(),cause);
exception when unique_violation then raise exception 'Your vote has already been recorded';
end $$;
revoke all on function public.charity_vote_status(),public.cast_charity_vote(uuid) from public,anon;
grant execute on function public.charity_vote_status(),public.cast_charity_vote(uuid) to authenticated;
-- Previously accepted votes and closed history are preserved. No vote, receipt,
-- invoice, ledger entry or membership is changed by this migration.
commit;
