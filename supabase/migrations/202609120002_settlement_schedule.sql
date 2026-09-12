begin;
create extension if not exists pg_cron;
create table public.settlement_attempts(month date not null,livemode boolean not null,last_attempt_at timestamptz not null default now(),result text not null,primary key(month,livemode));
alter table public.settlement_attempts enable row level security;
revoke all on public.settlement_attempts from anon,authenticated;
create function public.process_due_settlements() returns void language plpgsql security definer set search_path='' as $$
declare r record; outcome text;
begin
 for r in select distinct e.month,e.livemode from public.enrollments e where e.month<date_trunc('month',now())::date and not exists(select 1 from public.settlements s where s.month=e.month and s.livemode=e.livemode) loop
  begin
   outcome:=public.settle_net_month(r.month,r.livemode)::text;
  exception when others then outcome:=sqlerrm;
  end;
  insert into public.settlement_attempts(month,livemode,result) values(r.month,r.livemode,outcome)
  on conflict(month,livemode) do update set last_attempt_at=now(),result=excluded.result;
 end loop;
end $$;
revoke all on function public.process_due_settlements() from public,anon,authenticated;
grant execute on function public.process_due_settlements() to service_role;
select cron.schedule('levav-monthly-settlement','0 15 * * *',$$select public.process_due_settlements();$$);
commit;
