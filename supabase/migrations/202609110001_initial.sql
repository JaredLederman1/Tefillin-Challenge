-- Levav: identity, server-dated check-ins, private photos, readonly balances.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  timezone text not null default 'America/New_York',
  contribution_cents integer not null default 1800 check (contribution_cents between 500 and 100000),
  created_at timestamptz not null default now()
);
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkin_date date not null,
  photo_path text not null unique,
  caption text not null default '' check (length(caption) <= 500),
  shared boolean not null default true,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);
create index checkins_feed_idx on public.checkins(created_at desc) where shared;
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null,
  external_id text not null unique,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger(user_id, created_at desc);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  month date not null check (extract(day from month)=1),
  contribution_cents integer not null check (contribution_cents between 500 and 100000),
  timezone text not null,
  payment_reference text not null unique,
  paid_at timestamptz not null,
  settled_at timestamptz,
  unique(user_id, month),
  check ((paid_at at time zone timezone)::date < month)
);
create table public.settlements (
  month date primary key,
  forfeited_cents bigint not null,
  settled_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.ledger enable row level security;
alter table public.enrollments enable row level security;
alter table public.settlements enable row level security;
revoke all on public.profiles, public.checkins, public.ledger, public.enrollments, public.settlements from anon, authenticated;
grant select on public.profiles, public.checkins, public.ledger, public.enrollments to authenticated;
create policy profiles_member_read on public.profiles for select to authenticated using (true);
create policy checkins_visible on public.checkins for select to authenticated using (user_id=auth.uid() or shared);
create policy own_ledger on public.ledger for select to authenticated using (user_id=auth.uid());
create policy own_enrollments on public.enrollments for select to authenticated using (user_id=auth.uid());
create function public.on_member_created() returns trigger language plpgsql security definer set search_path='' as $$
declare tz text;
begin
  tz := coalesce(new.raw_user_meta_data->>'timezone','America/New_York');
  if not exists(select 1 from pg_timezone_names where name=tz) then tz := 'America/New_York'; end if;
  insert into public.profiles(id,display_name,timezone) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Member'),80),tz);
  return new;
end;
$$;
revoke all on function public.on_member_created() from public, anon, authenticated;
create trigger create_member_profile after insert on auth.users for each row execute function public.on_member_created();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('checkins','checkins',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy checkin_photo_upload on storage.objects for insert to authenticated
with check(bucket_id='checkins' and (storage.foldername(name))[1]=auth.uid()::text);
create policy checkin_photo_read on storage.objects for select to authenticated
using(bucket_id='checkins' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.checkins c where c.photo_path=name and c.shared)));
create policy orphan_photo_cleanup on storage.objects for delete to authenticated
using(bucket_id='checkins' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.checkins c where c.photo_path=name));
create function public.submit_checkin(photo_path text, photo_caption text default '', is_shared boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid := auth.uid(); local_day date; result_id uuid; member_tz text;
begin
  if member_id is null then raise exception 'Sign in before posting a wrap.'; end if;
  select p.timezone into member_tz from public.profiles p where p.id=member_id;
  if member_tz is null then raise exception 'Your profile is not ready.'; end if;
  local_day := (now() at time zone member_tz)::date;
  if extract(dow from local_day)=6 then raise exception 'Shabbat is a rest day.'; end if;
  if split_part(photo_path,'/',1) <> member_id::text then raise exception 'Invalid photo owner.'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='checkins' and o.name=photo_path and o.created_at >= now()-interval '1 hour') then raise exception 'Upload a new photo first.'; end if;
  insert into public.checkins(user_id,checkin_date,photo_path,caption,shared)
  values(member_id,local_day,photo_path,coalesce(photo_caption,''),is_shared) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.submit_checkin(text,text,boolean) from public, anon;
grant execute on function public.submit_checkin(text,text,boolean) to authenticated;
commit;
