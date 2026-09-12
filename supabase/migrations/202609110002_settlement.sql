-- Backend-only settlement. Do not schedule until payment, review, and launch terms are approved.
create function public.settle_month(target_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  month_end date := (target_month + interval '1 month')::date;
  winner_total numeric;
  forfeited bigint;
  required_days integer;
  reward_total bigint;
  result jsonb;
begin
  if target_month is null or extract(day from target_month) <> 1 then raise exception 'Use the first day of the month.'; end if;
  perform pg_advisory_xact_lock(hashtext('tefillin-settlement'), (target_month-date '2000-01-01')::integer);
  if exists(select 1 from public.settlements where month=target_month) then return jsonb_build_object('status','already_settled'); end if;
  -- Lock the captured, verified enrollments so retries cannot double-credit funds.
  perform 1 from public.enrollments where month=target_month for update;
  if not exists(select 1 from public.enrollments where month=target_month) then raise exception 'No paid enrollments.'; end if;
  if exists(select 1 from public.enrollments where month=target_month and (now() at time zone timezone)::date < month_end) then raise exception 'The month is still active.'; end if;
  if exists(select 1 from public.checkins c join public.enrollments e on e.user_id=c.user_id and e.month=target_month where c.checkin_date>=target_month and c.checkin_date<month_end and c.review_status='pending') then raise exception 'Finish photo review before settlement.'; end if;
  select count(*) into required_days from generate_series(target_month::timestamp,(month_end-1)::timestamp,interval '1 day') day where extract(dow from day)<>6;
  create temporary table settlement_work on commit drop as
  select e.user_id,e.contribution_cents,
    (select count(*) from public.checkins c where c.user_id=e.user_id and c.checkin_date>=target_month and c.checkin_date<month_end and extract(dow from c.checkin_date)<>6 and c.review_status='approved')=required_days as completed
  from public.enrollments e where e.month=target_month;
  select coalesce(sum(contribution_cents) filter(where completed),0),coalesce(sum(contribution_cents) filter(where not completed),0) into winner_total,forfeited from settlement_work;
  if winner_total=0 then raise exception 'No finishers: resolve the rollover policy before settling.'; end if;
  -- Exact integer-cent allocation, descending fractional remainder, stable UUID tie-break.
  with raw as (
    select user_id, contribution_cents, floor(forfeited::numeric*contribution_cents/winner_total)::bigint as base,
      mod(forfeited::numeric*contribution_cents,winner_total) as remainder
    from settlement_work where completed
  ), ranked as (
    select *,row_number() over(order by remainder desc,user_id) as position, forfeited-sum(base) over() as leftover from raw
  )
  insert into public.ledger(user_id,amount_cents,description,external_id)
  select user_id,contribution_cents+base+case when position<=leftover then 1 else 0 end,
    to_char(target_month,'FMMonth YYYY')||' challenge · contribution returned + reward',
    'settlement:'||target_month::text||':'||user_id::text from ranked;
  insert into public.settlements(month,forfeited_cents) values(target_month,forfeited);
  update public.enrollments set settled_at=now() where month=target_month;
  select sum(amount_cents) into reward_total from public.ledger where external_id like 'settlement:'||target_month::text||':%';
  result := jsonb_build_object('status','settled','forfeited_cents',forfeited,'total_credited_cents',reward_total);
  drop table settlement_work;
  return result;
end;
$$;
revoke all on function public.settle_month(date) from public,anon,authenticated;
grant execute on function public.settle_month(date) to service_role;
