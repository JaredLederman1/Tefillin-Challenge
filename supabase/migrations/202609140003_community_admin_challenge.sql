begin;

create table public.community_admins (
 community_id uuid not null references public.communities(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key (community_id,user_id)
);
create index community_admins_user_idx on public.community_admins(user_id,community_id);
alter table public.community_admins enable row level security;
revoke all on public.community_admins from public,anon,authenticated;

-- Grant the Cornell role to the account with the requested phone number.
-- Additional admins are provisioned by a database administrator.
insert into public.community_admins(community_id,user_id)
select c.id,o.user_id from public.communities c
cross join public.member_onboarding o
where c.name='Chabad at Cornell'
 and regexp_replace(coalesce(o.phone,''),'\D','','g')='7816313110'
on conflict do nothing;

create function public.is_community_admin(p_community_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.community_admins a
  where a.user_id=auth.uid() and a.community_id=p_community_id
 )
$$;
revoke all on function public.is_community_admin(uuid) from public,anon;
grant execute on function public.is_community_admin(uuid) to authenticated;

create function public.my_admin_communities()
returns table(community_id uuid,community_name text)
language sql stable security definer set search_path='' as $$
 select c.id,c.name from public.community_admins a
 join public.communities c on c.id=a.community_id
 where a.user_id=auth.uid() and c.active
 order by c.name
$$;
revoke all on function public.my_admin_communities() from public,anon;
grant execute on function public.my_admin_communities() to authenticated;

create table public.community_challenges (
 community_id uuid primary key references public.communities(id) on delete cascade,
 streak_target integer not null check(streak_target between 1 and 365),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table public.community_challenges enable row level security;
revoke all on public.community_challenges from public,anon,authenticated;
grant select on public.community_challenges to authenticated;
create policy community_challenge_read on public.community_challenges for select to authenticated
using(public.is_community_member(community_id) or public.is_community_admin(community_id));

create function public.set_community_streak_target(p_community_id uuid,p_target integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_community_admin(p_community_id) then raise exception 'Community admin access required.'; end if;
 if p_target is null or p_target not between 1 and 365 then raise exception 'Choose a target from 1 to 365 days.'; end if;
 insert into public.community_challenges(community_id,streak_target,updated_by)
 values(p_community_id,p_target,auth.uid())
 on conflict(community_id) do update set streak_target=excluded.streak_target,updated_at=now(),updated_by=auth.uid();
end $$;
revoke all on function public.set_community_streak_target(uuid,integer) from public,anon;
grant execute on function public.set_community_streak_target(uuid,integer) to authenticated;

create function public.community_admin_roster(p_community_id uuid)
returns table(user_id uuid,full_name text,school text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_community_admin(p_community_id) then raise exception 'Community admin access required.'; end if;
 return query select m.user_id,o.full_name,o.school,m.joined_at
 from public.community_memberships m
 join public.member_onboarding o on o.user_id=m.user_id
 where m.community_id=p_community_id
 order by lower(o.full_name),m.user_id;
end $$;
revoke all on function public.community_admin_roster(uuid) from public,anon;
grant execute on function public.community_admin_roster(uuid) to authenticated;

create function public.community_admin_wraps(p_community_id uuid,p_user_id uuid)
returns table(checkin_date date,photo_path text,caption text,review_status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_community_admin(p_community_id) then raise exception 'Community admin access required.'; end if;
 if not exists(select 1 from public.community_memberships m where m.community_id=p_community_id and m.user_id=p_user_id) then
  raise exception 'Member is not in this community.';
 end if;
 return query select c.checkin_date,c.photo_path,c.caption,c.review_status
 from public.checkins c where c.user_id=p_user_id
 order by c.checkin_date desc;
end $$;
revoke all on function public.community_admin_wraps(uuid,uuid) from public,anon;
grant execute on function public.community_admin_wraps(uuid,uuid) to authenticated;

create function public.can_community_admin_read_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.checkins c
  join public.community_memberships m on m.user_id=c.user_id
  join public.community_admins a on a.community_id=m.community_id and a.user_id=auth.uid()
  where c.photo_path=p_path
 )
$$;
revoke all on function public.can_community_admin_read_photo(text) from public,anon;
grant execute on function public.can_community_admin_read_photo(text) to authenticated;

create policy community_admin_photo_read on storage.objects for select to authenticated
using(bucket_id='checkins' and public.can_community_admin_read_photo(name));

commit;
