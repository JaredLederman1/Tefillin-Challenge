-- Run in Supabase SQL editor. All fixtures and credits are rolled back.
begin;
insert into auth.users(id,raw_user_meta_data) values
('aaaaaaaa-0000-4000-8000-000000000001','{"display_name":"Test A","timezone":"America/New_York"}'),
('aaaaaaaa-0000-4000-8000-000000000002','{"display_name":"Test B","timezone":"America/New_York"}'),
('aaaaaaaa-0000-4000-8000-000000000003','{"display_name":"Test C","timezone":"America/New_York"}');
insert into public.enrollments(user_id,month,contribution_cents,timezone,payment_reference,paid_at) values
('aaaaaaaa-0000-4000-8000-000000000001','2026-08-01',1800,'America/New_York','test-payment-a','2026-07-30T12:00:00Z'),
('aaaaaaaa-0000-4000-8000-000000000002','2026-08-01',3600,'America/New_York','test-payment-b','2026-07-30T12:00:00Z'),
('aaaaaaaa-0000-4000-8000-000000000003','2026-08-01',1000,'America/New_York','test-payment-c','2026-07-30T12:00:00Z');
insert into public.checkins(user_id,checkin_date,photo_path,shared,review_status)
select u.id,d::date,u.id::text||'/'||d::date||'.jpg',false,'approved'
from public.profiles u cross join generate_series('2026-08-01'::date,'2026-08-31'::date,interval '1 day') d
where u.id in ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002') and extract(dow from d)<>6;
do $$
declare result jsonb;
begin
 result:=public.settle_month('2026-08-01');
 if (result->>'total_credited_cents')::bigint<>6400 then raise exception 'Money conservation failed'; end if;
 if (select amount_cents from public.ledger where user_id='aaaaaaaa-0000-4000-8000-000000000001')<>2133 then raise exception 'Weighting failed for A'; end if;
 if (select amount_cents from public.ledger where user_id='aaaaaaaa-0000-4000-8000-000000000002')<>4267 then raise exception 'Remainder allocation failed for B'; end if;
 if public.settle_month('2026-08-01')->>'status'<>'already_settled' then raise exception 'Idempotency failed'; end if;
 if has_function_privilege('authenticated','public.settle_month(date)','EXECUTE') then raise exception 'Client can settle money'; end if;
 if has_table_privilege('authenticated','public.ledger','INSERT') then raise exception 'Client can write money'; end if;
 if has_table_privilege('anon','public.checkins','SELECT') then raise exception 'Anonymous photo access'; end if;
 if (select public from storage.buckets where id='checkins') then raise exception 'Photo bucket is public'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.ledger)<>1 then raise exception 'Ledger RLS failed'; end if;
 if exists(select 1 from public.checkins where user_id<>'aaaaaaaa-0000-4000-8000-000000000001') then raise exception 'Private photo RLS failed'; end if;
 begin
  insert into public.ledger(user_id,amount_cents,description,external_id) values(auth.uid(),99999,'forged','forged');
  raise exception 'Client forged a balance';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: pro rata rewards, cent conservation, idempotency, private photos, ledger RLS, client-write protection; fixtures rolled back' as result;
