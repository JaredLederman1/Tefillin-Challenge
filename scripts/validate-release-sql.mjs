import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2]||'@electric-sql/pglite');
import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();
await db.exec(`
-- Disposable database only: freeze the PostgreSQL clock on a voting day.
-- statement_timestamp remains real; tests never replace production functions.
create or replace function pg_catalog.now() returns timestamptz language sql stable as $$
 select coalesce(nullif(current_setting('test.clock',true),'')::timestamptz,pg_catalog.statement_timestamp()) $$;
set test.clock='2026-10-01T16:00:00Z';
create role anon;create role authenticated;create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,raw_app_meta_data jsonb default '{}'::jsonb);
create table auth.identities(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,provider_id text,provider text,identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,created_at timestamptz default now());
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
create schema cron;
create table cron.job(jobid bigint,jobname text);
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
`);
const dir=new URL('../supabase/migrations/',import.meta.url);
for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
 if(file==='202610060006_first_day_charity_voting.sql'){
  // Existing accepted votes survive deadline shortening; closed history stays fixed.
  await db.exec(`insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000003','legacy-voter@example.com');
   insert into charity_vote_rounds(month,closes_at,status) values('2026-12-01','2027-01-01T05:00:00Z','open'),('2025-12-01','2026-01-01T05:00:00Z','closed');
   insert into charity_vote_candidates(month,cause_id,tie_rank) select '2026-12-01',id,1 from donation_causes where enabled and livemode order by name limit 1;
   insert into charity_votes(month,user_id,cause_id) select '2026-12-01','00000000-0000-0000-0000-000000000003',cause_id from charity_vote_candidates where month='2026-12-01';`);
 }
 try {await db.exec(readFileSync(new URL(file,dir),'utf8').replace('create extension if not exists pg_cron;',''));}
 catch(e){console.error('FAILED',file,e.message);process.exitCode=1;await db.close();process.exit(1);}
}
assert.equal(Date.parse((await db.query("select closes_at::text cutoff from charity_vote_rounds where month='2026-12-01'")).rows[0].cutoff),Date.parse('2026-12-02T05:00:00Z'));
assert.equal(Date.parse((await db.query("select closes_at::text cutoff from charity_vote_rounds where month='2025-12-01'")).rows[0].cutoff),Date.parse('2026-01-01T05:00:00Z'));
assert.equal((await db.query("select count(*)::integer n from charity_votes where month='2026-12-01'")).rows[0].n,1);
console.log('Entire historical migration chain applied (pg_cron mocked); shortened open deadlines preserve votes and closed history');
await db.exec(readFileSync(new URL('../tests/apple-identity-onboarding.sql',import.meta.url),'utf8'));
console.log('Latest Apple identity/onboarding SQL fixture passed');
await db.exec("insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','one@example.com'),('00000000-0000-0000-0000-000000000002','two@example.com')");
await db.query(`select record_app_subscription($1,'100','100','Sandbox',now(),now()+interval '1 month')`,['00000000-0000-0000-0000-000000000001']);
await db.query(`select record_app_subscription($1,'100','101','Sandbox',now(),now()+interval '2 months')`,['00000000-0000-0000-0000-000000000001']);
assert.equal((await db.query('select count(*)::integer n from app_subscription_transactions')).rows[0].n,2);
const newerExpiry=(await db.query('select access_expires_at::text expiry from billing_memberships')).rows[0].expiry;
await db.query(`select record_app_subscription($1,'100','100','Sandbox',now(),now()+interval '1 month')`,['00000000-0000-0000-0000-000000000001']);
assert.equal((await db.query('select access_expires_at::text expiry from billing_memberships')).rows[0].expiry,newerExpiry);
await assert.rejects(db.query(`select record_app_subscription($1,'100','100','Sandbox',now(),now()+interval '1 month')`,['00000000-0000-0000-0000-000000000002']),/another account/);
await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
let status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.votingWindowOpen,true);
assert.equal(Date.parse(status.opensAt),Date.parse('2026-10-01T04:00:00Z'));
assert.equal(Date.parse(status.closesAt),Date.parse('2026-10-02T04:00:00Z'));
assert.equal(status.subscriptionEligible,true);assert.equal(status.completionEligible,false);assert.equal(status.eligible,false);assert.equal(status.candidates.length,3);
assert.equal(status.completedDays,0);assert.equal(status.missingDays,status.requiredDays);assert.equal(status.budgetCents,null);assert.equal(status.subscriberCount,null);
const candidate=status.candidates[1].id;
await assert.rejects(db.query('select cast_charity_vote($1)',[candidate]),/Complete every required/);
await db.query(`insert into checkins(user_id,checkin_date,photo_path,review_status)
 select '00000000-0000-0000-0000-000000000001',d::date,'qualification:'||d::date,'approved'
 from generate_series($1::date::timestamp,$2::date::timestamp-interval '1 day',interval '1 day') d where is_required_wrap_day(d::date)`,[status.qualificationMonth,status.month]);
await db.exec(`update checkins set review_status='pending' where checkin_date=(select min(checkin_date) from checkins where user_id='00000000-0000-0000-0000-000000000001') and user_id='00000000-0000-0000-0000-000000000001'`);
status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.pendingReviewDays,1);assert.equal(status.missingDays,0);assert.equal(status.eligible,false);
await assert.rejects(db.query('select cast_charity_vote($1)',[candidate]),/awaiting approval/);
await db.exec(`update checkins set review_status='approved' where user_id='00000000-0000-0000-0000-000000000001'`);
status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.completionEligible,true);assert.equal(status.eligible,true);assert.equal(status.completedDays,status.requiredDays);
const nextVotingMonth=(await db.query(`select ($1::date+interval '1 month')::date::text as month`,[status.month])).rows[0].month;
await db.query(`insert into checkins(user_id,checkin_date,photo_path,review_status)
 select '00000000-0000-0000-0000-000000000001',d::date,'future-qualification:'||d::date,'approved'
 from generate_series($1::date::timestamp,$2::date::timestamp-interval '1 day',interval '1 day') d where is_required_wrap_day(d::date)`,[status.month,nextVotingMonth]);
const future=(await db.query(`select charity_vote_completion('00000000-0000-0000-0000-000000000001',$1) value`,[nextVotingMonth])).rows[0].value;
assert.equal(future.qualificationMonthEnded,false);assert.equal(future.completionEligible,false);
// Even forged future approved rows never count until their local dates arrive.
const currentApproved=(await db.query(`select count(*)::integer n from checkins where user_id='00000000-0000-0000-0000-000000000001' and checkin_date>=$1 and checkin_date<$2 and checkin_date<=(now() at time zone 'America/New_York')::date`,[status.month,nextVotingMonth])).rows[0].n;
assert.equal(future.completedDays,currentApproved);

// Optional dates are not needed and cannot substitute for one rejected required day.
await db.exec(`update checkins set review_status='rejected' where checkin_date=(select min(checkin_date) from checkins where user_id='00000000-0000-0000-0000-000000000001') and user_id='00000000-0000-0000-0000-000000000001'`);
status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.missingDays,1);assert.equal(status.completionEligible,false);
await db.exec(`update checkins set review_status='approved' where user_id='00000000-0000-0000-0000-000000000001'`);

await db.query('select cast_charity_vote($1)',[candidate]);
await assert.rejects(db.query('select cast_charity_vote($1)',[status.candidates[0].id]),/already been recorded/);
status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.voteCauseId,candidate);assert.equal(status.candidates[1].votes,1);
// A qualified subscriber is still denied outside the first New York day.
await db.exec("set test.clock='2026-10-02T04:00:00Z'");
await assert.rejects(db.query('select cast_charity_vote($1)',[candidate]),/only on the first day/);
// Restore the fixture clock before status refresh could finalize this round.
await db.exec("set test.clock='2026-10-01T16:00:00Z'");

await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';`);
await assert.rejects(db.query('select cast_charity_vote($1)',[candidate]),/active subscription/);
await assert.rejects(db.query('select close_charity_vote_round($1)',[status.month]),/still open/);
// Reconciled company funds are explicit snapshots, never estimated per user.
assert.equal(status.budgetCents,null);
await assert.rejects(db.query('select record_company_donation_funds($1,-1)',[status.month]),/nonnegative cents/);
await assert.rejects(db.query('select record_company_donation_funds($1,9007199254740992)',[status.month]),/nonnegative cents/);
await assert.rejects(db.query("select record_company_donation_funds('1900-01-01',100)"),/Initialize/);
await db.query('select record_company_donation_funds($1,0)',[status.month]);
assert.equal((await db.query('select charity_vote_status() value')).rows[0].value.budgetCents,0);
await db.query('select record_company_donation_funds($1,12500)',[status.month]);
await db.query('select record_company_donation_funds($1,11000)',[status.month]);
assert.equal((await db.query('select charity_vote_status() value')).rows[0].value.budgetCents,11000);
assert.equal((await db.query('select count(*)::integer n from company_donation_fund_records where month=$1',[status.month])).rows[0].n,3);
assert.equal((await db.query('select donation_cents from charity_vote_rounds where month=$1',[status.month])).rows[0].donation_cents,null);
await db.exec('set role authenticated');
await assert.rejects(db.query('select record_company_donation_funds($1,1)',[status.month]),/permission denied/);
await assert.rejects(db.query('select * from company_donation_fund_records'),/permission denied/);
await db.exec('reset role');
await db.query(`update charity_vote_rounds set closes_at=now()-interval '1 second' where month=$1`,[status.month]);
assert.equal((await db.query('select close_charity_vote_round($1) winner',[status.month])).rows[0].winner,candidate);
await db.query(`select publish_company_donation($1,180,now(),'https://example.com/receipt')`,[status.month]);
status=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(status.reports[0].donationCents,180);
await assert.rejects(db.query('select record_company_donation_funds($1,200)',[status.month]),/already been fulfilled/);
console.log('Recorded company fund snapshots, corrections, zero, permissions and fulfilled-round locking passed');
await db.exec('set role authenticated');
await assert.rejects(db.query(`select close_charity_vote_round($1)`,[status.month]),/permission denied/);
await assert.rejects(db.query(`select * from charity_votes`),/permission denied/);
await assert.rejects(db.query(`select charity_vote_completion('00000000-0000-0000-0000-000000000002',$1)`,[status.month]),/permission denied/);
await assert.rejects(db.query(`select request_donation(null,true,null,null,180)`),/permission denied/);
await db.exec('reset role');
await db.exec(`delete from billing_memberships where user_id='00000000-0000-0000-0000-000000000001';delete from profiles where id='00000000-0000-0000-0000-000000000001';`);
assert.equal((await db.query('select count(*)::integer n from app_subscription_transactions where user_id is null')).rows[0].n,2);
await db.query(`select record_app_subscription($1,'100','100','Sandbox',now(),now()+interval '1 month')`,['00000000-0000-0000-0000-000000000002']);
assert.equal((await db.query("select user_id from app_subscription_transactions where transaction_id='100'")).rows[0].user_id,'00000000-0000-0000-0000-000000000002');
console.log('Completion-gated eligibility, pending review, rejected days and qualified vote passed');
console.log('Subscription ownership/idempotency, voting eligibility/one vote, closure/winner/report, role privacy and retired actions passed');
// Due-round finalization is automatic and never touches personal money records.
const due=(await db.query(`select (date_trunc('month',now() at time zone 'America/New_York')-interval '1 month')::date::text as month`)).rows[0].month;
const older=(await db.query(`select (date_trunc('month',now() at time zone 'America/New_York')-interval '2 months')::date::text as month`)).rows[0].month;
const empty=(await db.query(`select (date_trunc('month',now() at time zone 'America/New_York')-interval '3 months')::date::text as month`)).rows[0].month;
const causes=(await db.query(`select id from donation_causes where enabled and livemode order by name limit 2`)).rows;
await db.query(`insert into charity_vote_rounds(month,closes_at) values($1,now()-interval '1 day'),($2,now()-interval '1 day'),($3,now()-interval '1 day')`,[due,older,empty]);
for(const month of [due,older])await db.query(`insert into charity_vote_candidates(month,cause_id,tie_rank) values($1,$2,1),($1,$3,2)`,[month,causes[0].id,causes[1].id]);
await db.query(`insert into charity_votes(month,user_id,cause_id) values($1,'00000000-0000-0000-0000-000000000002',$2)`,[due,causes[1].id]);
const beforeMoney=(await db.query(`select (select count(*) from ledger)::integer ledger,(select count(*) from enrollments)::integer enrollments,(select count(*) from billing_invoices)::integer invoices`)).rows[0];
await db.exec('select process_due_settlements();select process_due_settlements();');
assert.equal((await db.query('select winner_cause_id from charity_vote_rounds where month=$1',[due])).rows[0].winner_cause_id,causes[1].id);
assert.equal((await db.query('select winner_cause_id from charity_vote_rounds where month=$1',[older])).rows[0].winner_cause_id,causes[0].id);
assert.equal((await db.query('select status from charity_vote_rounds where month=$1',[empty])).rows[0].status,'open');
assert.equal((await db.query('select donation_cents from charity_vote_rounds where month=$1',[due])).rows[0].donation_cents,null);
assert.deepEqual((await db.query(`select (select count(*) from ledger)::integer ledger,(select count(*) from enrollments)::integer enrollments,(select count(*) from billing_invoices)::integer invoices`)).rows[0],beforeMoney);
await db.query(`update charity_vote_rounds set status='open',winner_cause_id=null where month=$1`,[older]);
await db.exec('select charity_vote_status();');
assert.equal((await db.query('select status from charity_vote_rounds where month=$1',[older])).rows[0].status,'closed');
await db.exec('set role authenticated');
await assert.rejects(db.query('select process_due_settlements()'),/permission denied/);
await db.exec('reset role');
console.log('Automatic due-round closure, zero-vote tie order, refresh closure, empty-slate handling, permissions and untouched money records passed');
// Boundaries are inclusive at day1 midnight, exclusive at day2 midnight,
// with both summer and winter UTC offsets and no invented fixed timezone.
for(const [month,stamp,expected] of [
 ['2026-10-01','2026-10-01T03:59:59Z',false],
 ['2026-10-01','2026-10-01T04:00:00Z',true],
 ['2026-10-01','2026-10-02T03:59:59Z',true],
 ['2026-10-01','2026-10-02T04:00:00Z',false],
 ['2026-01-01','2026-01-01T04:59:59Z',false],
 ['2026-01-01','2026-01-01T05:00:00Z',true],
 ['2026-01-01','2026-01-02T05:00:00Z',false],
 ['2026-11-01','2026-11-02T04:30:00Z',true],
 ['2026-11-01','2026-11-02T05:00:00Z',false],
])assert.equal((await db.query('select charity_vote_window_open($1,$2) value',[month,stamp])).rows[0].value,expected);
// No eligible popup after day1, even if the prior completion remains approved.
await db.exec("set test.clock='2026-10-06T16:00:00Z'");
const outside=(await db.query('select charity_vote_status() value')).rows[0].value;
assert.equal(outside.votingWindowOpen,false);assert.equal(outside.eligible,false);
await assert.rejects(db.query('select cast_charity_vote($1)',[candidate]),/only on the first day/);
await db.query(`select configure_charity_vote_round('2026-11-01',$1::uuid[])`,[[causes[0].id,causes[1].id]]);
assert.equal(Date.parse((await db.query("select closes_at::text cutoff from charity_vote_rounds where month='2026-11-01'")).rows[0].cutoff),Date.parse('2026-11-02T05:00:00Z'));
console.log('First-day NY success/refusal, new/future deadlines and DST boundaries passed');
await db.close();
