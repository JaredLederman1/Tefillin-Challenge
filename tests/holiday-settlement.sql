-- Run against Supabase with the service role/SQL editor. All fixtures roll back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); m uuid; u uuid; rid uuid:=gen_random_uuid(); r public.withdrawals; total bigint; d date; n integer:=0;
begin
 foreach u in array array[a,b,c] loop
  insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.com','{"display_name":"Billing test","timezone":"America/New_York"}');
  n:=n+1;
  insert into public.billing_memberships(user_id,livemode,amount_cents,status) values(u,false,case n when 1 then 1800 when 2 then 3600 else 1000 end,'active') returning id into m;
  perform public.record_paid_invoice('evt_test_'||u,false,m,'in_test_'||u,'pi_test_'||u,'ch_test_'||u,case n when 1 then 1800 when 2 then 3600 else 1000 end,100,'2020-03-20','2020-03-22','2020-03-20');
  perform public.record_paid_invoice('evt_test_'||u,false,m,'in_test_'||u,'pi_test_'||u,'ch_test_'||u,case n when 1 then 1800 when 2 then 3600 else 1000 end,100,'2020-03-20','2020-03-22','2020-03-20');
  if n<3 then
   for d in select day::date from generate_series(date '2020-04-01',date '2020-04-30',interval '1 day') day where public.is_required_wrap_day(day::date) loop
    insert into public.checkins(user_id,checkin_date,photo_path,review_status) values(u,d,u||'/'||d||'.jpg','approved');
   end loop;
  end if;
 end loop;
 perform public.settle_net_month('2020-04-01',false);
 perform public.settle_net_month('2020-04-01',false);
 select sum(amount_cents) into total from public.ledger where user_id in(a,b,c) and not livemode;
 if total<>6100 then raise exception 'Net pool conservation failed: %',total;end if;
 if (select sum(amount_cents) from public.ledger where user_id=a and not livemode)<>2033 then raise exception 'Weighted allocation failed';end if;
 if (select sum(amount_cents) from public.ledger where user_id=b and not livemode)<>4067 then raise exception 'Remainder allocation failed';end if;
 if exists(select 1 from public.ledger where user_id in(a,b,c) and livemode) then raise exception 'Mode isolation failed';end if;
 raise notice 'PASS: holiday-aware settlement, exact allocation, and mode isolation';
end $$;
rollback;
