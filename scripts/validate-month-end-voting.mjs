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
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,raw_app_meta_data jsonb default '{}'::jsonb,created_at timestamptz default now());
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
 catch(e){console.error('FAILED',file,e.message);process.exitCode=1;await db.exec(`insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000011','reviewer@example.com');set request.jwt.claim.sub='00000000-0000-0000-0000-000000000010';`);
const wrapId=(await db.query("select id from checkins where user_id='00000000-0000-0000-0000-000000000010' and review_status='pending' limit 1")).rows[0].id;
await assert.rejects(db.query('select confirm_wrap($1)',[wrapId]),/own wrap/);
await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';`);
await db.query('select confirm_wrap($1)',[wrapId]);await db.query('select confirm_wrap($1)',[wrapId]);
assert.equal((await db.query('select review_status from checkins where id=$1',[wrapId])).rows[0].review_status,'approved');
assert.equal((await db.query('select count(*)::int n from wrap_confirmations where checkin_id=$1',[wrapId])).rows[0].n,1);
await db.query("update checkins set review_status='rejected' where id=$1",[wrapId]);
await assert.rejects(db.query('select confirm_wrap($1)',[wrapId]),/cannot be confirmed/);
await db.exec('set role authenticated');
await assert.rejects(db.query('insert into wrap_confirmations(checkin_id,confirmer_id) values($1,$2)',[wrapId,'00000000-0000-0000-0000-000000000010']),/permission denied/);
await db.exec('reset role');
console.log('Peer approval: self-confirmation blocked, one reviewer approves, retries are idempotent, rejection cannot be overridden, direct writes forbidden');
await db.close();process.exit(1);}
}

await db.exec(`set test.clock='2026-10-31T16:00:00Z';
insert into auth.users(id,email,created_at) values('00000000-0000-0000-0000-000000000010','new@example.com','2026-10-15T16:00:00Z');
update profiles set timezone='America/New_York' where id='00000000-0000-0000-0000-000000000010';`);
let c=(await db.query("select charity_vote_completion('00000000-0000-0000-0000-000000000010','2026-11-01') c")).rows[0].c;
assert.equal(c.qualificationStart,'2026-10-15');assert.equal(c.qualificationEnd,'2026-10-31');assert.equal(c.completionEligible,false);
assert.equal((await db.query("select count(*)::int n from generate_series('2026-10-15'::timestamp,'2026-10-31'::timestamp,interval '1 day') d where is_required_wrap_day(d::date)")).rows[0].n,c.requiredDays);
assert.equal((await db.query("select charity_vote_window_open('2026-11-01','2026-10-31T03:59:59Z') v")).rows[0].v,false);
assert.equal((await db.query("select charity_vote_window_open('2026-11-01','2026-10-31T04:00:00Z') v")).rows[0].v,true);
assert.equal((await db.query("select charity_vote_window_open('2026-11-01','2026-11-01T04:00:00Z') v")).rows[0].v,false);
c=(await db.query("select charity_vote_completion('00000000-0000-0000-0000-000000000010','2026-12-01') c")).rows[0].c;
assert.equal(c.qualificationStart,'2026-11-01');assert.equal(c.completionEligible,false);
await db.exec(`insert into checkins(user_id,checkin_date,photo_path,review_status)
select '00000000-0000-0000-0000-000000000010',d::date,'test/'||d::date,'approved' from generate_series('2026-10-15'::timestamp,'2026-10-31'::timestamp,interval '1 day') d where is_required_wrap_day(d::date);`);
c=(await db.query("select charity_vote_completion('00000000-0000-0000-0000-000000000010','2026-11-01') c")).rows[0].c;
assert.equal(c.completionEligible,true);assert.equal(c.qualificationMonthEnded,false);
await db.exec(`update checkins set review_status='pending' where user_id='00000000-0000-0000-0000-000000000010' and checkin_date=(select max(checkin_date) from checkins where user_id='00000000-0000-0000-0000-000000000010');`);
c=(await db.query("select charity_vote_completion('00000000-0000-0000-0000-000000000010','2026-11-01') c")).rows[0].c;
assert.equal(c.completionEligible,false);assert.equal(c.pendingReviewDays,1);
console.log('Migration chain, partial signup month, next full month, missing wraps, New York opening and cutoff passed');
await db.exec(`insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000011','reviewer@example.com');set request.jwt.claim.sub='00000000-0000-0000-0000-000000000010';`);
const wrapId=(await db.query("select id from checkins where user_id='00000000-0000-0000-0000-000000000010' and review_status='pending' limit 1")).rows[0].id;
await assert.rejects(db.query('select confirm_wrap($1)',[wrapId]),/own wrap/);
await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';`);
await db.query('select confirm_wrap($1)',[wrapId]);await db.query('select confirm_wrap($1)',[wrapId]);
assert.equal((await db.query('select review_status from checkins where id=$1',[wrapId])).rows[0].review_status,'approved');
assert.equal((await db.query('select count(*)::int n from wrap_confirmations where checkin_id=$1',[wrapId])).rows[0].n,1);
await db.query("update checkins set review_status='rejected' where id=$1",[wrapId]);
await assert.rejects(db.query('select confirm_wrap($1)',[wrapId]),/cannot be confirmed/);
await db.exec('set role authenticated');
await assert.rejects(db.query('insert into wrap_confirmations(checkin_id,confirmer_id) values($1,$2)',[wrapId,'00000000-0000-0000-0000-000000000010']),/permission denied/);
await db.exec('reset role');
console.log('Peer approval: self-confirmation blocked, one reviewer approves, retries are idempotent, rejection cannot be overridden, direct writes forbidden');
await db.close();
