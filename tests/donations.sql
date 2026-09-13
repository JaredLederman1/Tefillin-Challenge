-- Rollback-only integration test; execute with the SQL editor / management CLI.
begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); c uuid; rid uuid:=gen_random_uuid(); r public.donation_requests;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.com','{"timezone":"America/New_York"}'),(v,v||'@example.com','{"timezone":"America/New_York"}');
 insert into public.donation_causes(name,livemode,enabled) values('Test cause',false,true) returning id into c;
 insert into public.ledger(user_id,amount_cents,description,external_id,livemode) values(u,2033,'Fixture','fixture:'||u,false),(u,500,'Live fixture','live-fixture:'||u,true);
 r:=public.request_donation(u,false,c,rid,2033);
 if r.amount_cents<>2033 or r.status<>'pending' then raise exception 'Request incorrect';end if;
 perform public.request_donation(u,false,c,rid,2033);
 if (select sum(amount_cents) from public.ledger where user_id=u and not livemode)<>0 then raise exception 'Debit incorrect';end if;
 if (select sum(amount_cents) from public.ledger where user_id=u and livemode)<>500 then raise exception 'Live funds changed';end if;
 begin
  perform public.request_donation(v,false,c,rid,2033);
  raise exception 'Cross-user replay allowed';
 exception when others then if sqlerrm='Cross-user replay allowed' then raise;end if;end;
 begin
  perform public.request_donation(u,false,c,gen_random_uuid(),2033);
  raise exception 'Double spend allowed';
 exception when others then if sqlerrm='Double spend allowed' then raise;end if;end;
 perform public.resolve_donation(rid,'canceled','Test cancellation');
 perform public.resolve_donation(rid,'canceled','Test cancellation');
 if (select sum(amount_cents) from public.ledger where user_id=u and not livemode)<>2033 then raise exception 'Return incorrect';end if;
 update public.donation_causes set enabled=false where id=c;
 begin
  perform public.request_donation(u,false,c,gen_random_uuid(),2033);
  raise exception 'Disabled cause accepted';
 exception when others then if sqlerrm='Disabled cause accepted' then raise;end if;end;
 update public.donation_causes set enabled=true where id=c;
 rid:=gen_random_uuid();
 perform public.request_donation(u,false,c,rid,2033);
 begin
  perform public.resolve_donation(rid,'fulfilled','');
  raise exception 'Missing receipt accepted';
 exception when others then if sqlerrm='Missing receipt accepted' then raise;end if;end;
 perform public.resolve_donation(rid,'fulfilled','TEST-RECEIPT');
 perform public.resolve_donation(rid,'fulfilled','TEST-RECEIPT');
 begin
  perform public.resolve_donation(rid,'canceled','Invalid reversal');
  raise exception 'Fulfilled donation reversed';
 exception when others then if sqlerrm='Fulfilled donation reversed' then raise;end if;end;
 if (select sum(amount_cents) from public.ledger where user_id=u and not livemode)<>0 then raise exception 'Fulfillment debit duplicated';end if;
 if has_function_privilege('authenticated','public.request_donation(uuid,boolean,uuid,uuid,bigint)','EXECUTE') or has_function_privilege('authenticated','public.resolve_donation(uuid,text,text)','EXECUTE') or has_function_privilege('service_role','public.reserve_withdrawal(uuid,boolean,bigint,text,uuid)','EXECUTE') then raise exception 'Permissions exposed';end if;
 raise notice 'PASS: full-balance donation, replay, mode isolation, cross-user protection, overspending, cancellation, disabled cause, receipt requirement, terminal status, permissions';
end $$;
rollback;
