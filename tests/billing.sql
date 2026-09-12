-- Run against Supabase with the service role/SQL editor. All fixtures roll back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); m uuid; u uuid; rid uuid:=gen_random_uuid(); r public.withdrawals; total bigint; d date; n integer:=0;
begin
 foreach u in array array[a,b,c] loop
  insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.com','{"display_name":"Billing test","timezone":"America/New_York"}');
  n:=n+1;
  insert into public.billing_memberships(user_id,livemode,amount_cents,status) values(u,false,case n when 1 then 1800 when 2 then 3600 else 1000 end,'active') returning id into m;
  perform public.record_paid_invoice('evt_test_'||u,false,m,'in_test_'||u,'pi_test_'||u,'ch_test_'||u,case n when 1 then 1800 when 2 then 3600 else 1000 end,100,'2020-07-20','2020-07-22','2020-07-20');
  perform public.record_paid_invoice('evt_test_'||u,false,m,'in_test_'||u,'pi_test_'||u,'ch_test_'||u,case n when 1 then 1800 when 2 then 3600 else 1000 end,100,'2020-07-20','2020-07-22','2020-07-20');
  if n<3 then
   for d in select day::date from generate_series(date '2020-08-01',date '2020-08-31',interval '1 day') day where extract(dow from day)<>6 loop
    insert into public.checkins(user_id,checkin_date,photo_path,review_status) values(u,d,u||'/'||d||'.jpg','approved');
   end loop;
  end if;
 end loop;
 perform public.settle_net_month('2020-08-01',false);
 perform public.settle_net_month('2020-08-01',false);
 select sum(amount_cents) into total from public.ledger where user_id in(a,b,c) and not livemode;
 if total<>6100 then raise exception 'Net pool conservation failed: %',total;end if;
 if (select sum(amount_cents) from public.ledger where user_id=a and not livemode)<>2033 then raise exception 'Weighted allocation failed';end if;
 if (select sum(amount_cents) from public.ledger where user_id=b and not livemode)<>4067 then raise exception 'Remainder allocation failed';end if;
 if exists(select 1 from public.ledger where user_id in(a,b,c) and livemode) then raise exception 'Mode isolation failed';end if;
 insert into public.payout_accounts values(a,false,'acct_test_'||a);
 select * into r from public.reserve_withdrawal(a,false,1000,'acct_test_'||a,rid);
 select * into r from public.reserve_withdrawal(a,false,1000,'acct_test_'||a,gen_random_uuid());
 if r.id<>rid then raise exception 'Duplicate reservation';end if;
 if (select sum(amount_cents) from public.ledger where user_id=a and not livemode)<>1033 then raise exception 'Reservation balance wrong';end if;
 update public.withdrawals set status='transferred',transfer_id='tr_test_'||rid where id=rid;
 begin
  perform public.reserve_withdrawal(a,false,1034,'acct_test_'||a,gen_random_uuid());
  raise exception 'Overspending allowed';
 exception when others then if sqlerrm='Overspending allowed' then raise;end if;end;
 if has_function_privilege('authenticated','public.settle_net_month(date,boolean)','EXECUTE') then raise exception 'Settlement access exposed';end if;
 if has_function_privilege('authenticated','public.reserve_withdrawal(uuid,boolean,bigint,text,uuid)','EXECUTE') then raise exception 'Reservation access exposed';end if;
 raise notice 'PASS: invoice idempotency, actual fees, exact allocation, mode isolation, withdrawal reservation, overspending and permissions';
end $$;
rollback;
