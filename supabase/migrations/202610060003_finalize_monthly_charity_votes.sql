begin;
-- Keep the existing daily cron hook, but it now closes only company charity
-- votes. It never settles legacy pools, credits wallets, or transfers money.
create or replace function public.process_due_settlements() returns void
language plpgsql security definer set search_path='' as $$
declare due_month date;
begin
 for due_month in
  select r.month from public.charity_vote_rounds r
  where r.status='open' and r.closes_at<=now()
   and exists(select 1 from public.charity_vote_candidates c where c.month=r.month)
  order by r.month
 loop
  perform public.close_charity_vote_round(due_month);
 end loop;
end $$;
revoke all on function public.process_due_settlements() from public,anon,authenticated;
grant execute on function public.process_due_settlements() to service_role;

-- Refresh also finalizes due rounds so members see the previous month's result
-- immediately on opening the app, without waiting for the daily cron run.
create or replace function public.ensure_charity_vote_round() returns date
language plpgsql security definer set search_path='' as $$
declare target date := date_trunc('month',now() at time zone 'America/New_York')::date;
begin
 perform public.process_due_settlements();
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
revoke all on function public.ensure_charity_vote_round() from public,anon,authenticated;
grant execute on function public.ensure_charity_vote_round() to service_role;
commit;
