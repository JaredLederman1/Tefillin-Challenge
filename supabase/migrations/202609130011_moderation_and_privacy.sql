begin;

-- Moderation access is an explicit server-side role, never a client-side flag.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique (checkin_id, reporter_id)
);
create index if not exists content_reports_review_idx on public.content_reports(status, created_at desc);

alter table public.app_admins enable row level security;
alter table public.content_reports enable row level security;
revoke all on public.app_admins, public.content_reports from anon, authenticated;

create function public.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.app_admins where user_id=auth.uid());
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create function public.report_checkin(p_checkin_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare reporter uuid:=auth.uid();
begin
  if reporter is null then raise exception 'Sign in to report a post.'; end if;
  if p_reason is null or char_length(trim(p_reason))>500 then raise exception 'Report details are too long.'; end if;
  if not exists(select 1 from public.checkins where id=p_checkin_id and shared=true) then raise exception 'That post is no longer available.'; end if;
  insert into public.content_reports(checkin_id,reporter_id,reason)
  values(p_checkin_id,reporter,trim(p_reason))
  on conflict(checkin_id,reporter_id) do update set reason=excluded.reason, status='open', created_at=now(), reviewed_at=null, reviewed_by=null;
end;
$$;
revoke all on function public.report_checkin(uuid,text) from public, anon;
grant execute on function public.report_checkin(uuid,text) to authenticated;

-- Seed the owner identities used in development. Apple private-relay accounts can
-- be added later by inserting their auth user id into app_admins.
insert into public.app_admins(user_id)
select id from auth.users where lower(email) in ('jared.a.lederman@gmail.com','jared@ratzonapp.com')
on conflict do nothing;

commit;
