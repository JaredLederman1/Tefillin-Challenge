-- Minimal PostgreSQL baseline for subscription/charity-vote integration checks.

create role anon;create role authenticated;create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table profiles(id uuid primary key);
create table billing_memberships(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),livemode boolean,amount_cents integer,contribution_cents integer,covers_stripe_fee boolean default false,status text default 'creating',subscription_id text unique,cancel_at_period_end boolean default false,created_at timestamptz default now());
create unique index one_open_membership on billing_memberships(user_id,livemode) where status not in ('canceled','incomplete_expired');
create table billing_invoices(id text primary key,membership_id uuid references billing_memberships(id),payment_intent_id text unique,charge_id text unique,month date,amount_cents integer,fee_cents integer,paid_at timestamptz,available_at timestamptz,status text,livemode boolean,unique(membership_id,month));
create table billing_events(id text primary key,livemode boolean);
create table donation_causes(id uuid primary key default gen_random_uuid(),name text,description text,website_url text,enabled boolean,livemode boolean);
create function reserve_membership(uuid,boolean,integer) returns void language sql as $$select$$;
create function reserve_membership(uuid,boolean,integer,boolean) returns void language sql as $$select$$;
create function request_donation(uuid,boolean,uuid,uuid,bigint) returns void language sql as $$select$$;
create function reserve_withdrawal(uuid,boolean,bigint,text,uuid) returns void language sql as $$select$$;
create function set_charity_preference(uuid,boolean) returns void language sql as $$select$$;
create function set_tefillin_goal(boolean) returns void language sql as $$select$$;
insert into profiles values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into donation_causes(name,enabled,livemode) values('A',true,true),('B',true,true),('C',true,true),('D',true,true),('E',true,true);
