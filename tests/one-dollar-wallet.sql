-- Exercise the actual invoice RPC and database constraints; all fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); m uuid; n integer; total bigint;
begin
 insert into auth.users(id,email,raw_user_meta_data)
 values(u,u||'@example.com','{"display_name":"Wallet regression","timezone":"America/New_York"}');
 insert into public.billing_memberships(user_id,livemode,amount_cents,status)
 values(u,false,100,'active') returning id into m;
 perform public.record_paid_invoice('evt_wallet_'||u,false,m,'in_wallet_'||u,'pi_wallet_'||u,'ch_wallet_'||u,100,33,'2020-07-20','2020-07-22','2020-07-20');
 -- Both a repeat reload and a later webhook must leave exactly one credit.
 perform public.record_paid_invoice('evt_wallet_'||u,false,m,'in_wallet_'||u,'pi_wallet_'||u,'ch_wallet_'||u,100,33,'2020-07-20','2020-07-22','2020-07-20');
 perform public.record_paid_invoice('evt_webhook_'||u,false,m,'in_wallet_'||u,'pi_wallet_'||u,'ch_wallet_'||u,100,33,'2020-07-20','2020-07-22','2020-07-20');
 select count(*),sum(amount_cents) into n,total from public.ledger where user_id=u and not livemode;
 if n<>1 or total<>67 then raise exception 'Expected one net $0.67 wallet entry, got % entries and % cents',n,total; end if;
 if (select count(*) from public.enrollments where user_id=u and contribution_cents=100)<>1 then raise exception 'Missing $1 enrollment'; end if;
 if exists(select 1 from public.ledger where user_id=u and livemode) then raise exception 'Test payment affected live wallet'; end if;
end $$;
rollback;
