begin;

create table public.communities (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(length(trim(name)) between 1 and 120),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

insert into public.communities(name) values('Chabad at Cornell');

create table public.community_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 community_id uuid not null references public.communities(id),
 joined_at timestamptz not null default now()
);
create index community_memberships_group_idx on public.community_memberships(community_id,user_id);

alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
revoke all on public.communities,public.community_memberships from public,anon,authenticated;
grant select on public.communities,public.community_memberships to authenticated;
create policy available_communities on public.communities for select to authenticated using(active);

-- A member can see the member list only for their own community. This helper
-- avoids recursive RLS evaluation on community_memberships.
create function public.is_community_member(p_community_id uuid) returns boolean
language sql security definer stable set search_path='' as $$
 select exists(select 1 from public.community_memberships where user_id=auth.uid() and community_id=p_community_id)
$$;
revoke all on function public.is_community_member(uuid) from public,anon;
grant execute on function public.is_community_member(uuid) to authenticated;
create policy own_community_members on public.community_memberships for select to authenticated
using(public.is_community_member(community_id));

create function public.complete_onboarding_with_community(
 p_full_name text,p_gender text,p_phone text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text,p_community_id uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_community_id is not null and not exists(select 1 from public.communities where id=p_community_id and active) then
  raise exception 'Choose an available community.';
 end if;
 perform public.complete_onboarding_v2(p_full_name,p_gender,p_phone,p_school,p_birthday,p_tradition,p_owns_tefillin,p_borrow_source,p_timezone);
 if p_community_id is not null then
  insert into public.community_memberships(user_id,community_id)
  values(auth.uid(),p_community_id)
  on conflict(user_id) do nothing;
 end if;
end $$;
revoke all on function public.complete_onboarding_with_community(text,text,text,text,date,text,boolean,text,text,uuid) from public,anon;
grant execute on function public.complete_onboarding_with_community(text,text,text,text,date,text,boolean,text,text,uuid) to authenticated;

-- Existing members can join or leave from Account. Only listed active groups
-- are accepted; no client may write the membership table directly.
create function public.set_my_community(p_community_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_community_id is null then
  delete from public.community_memberships where user_id=auth.uid();
  return;
 end if;
 if not exists(select 1 from public.communities where id=p_community_id and active) then raise exception 'Choose an available community.'; end if;
 if not exists(select 1 from public.member_onboarding where user_id=auth.uid()) then raise exception 'Complete your profile first.'; end if;
 insert into public.community_memberships(user_id,community_id) values(auth.uid(),p_community_id)
 on conflict(user_id) do update set community_id=excluded.community_id,joined_at=now();
end $$;
revoke all on function public.set_my_community(uuid) from public,anon;
grant execute on function public.set_my_community(uuid) to authenticated;

-- The server checks membership before returning any community-only result.
create function public.my_community_feed()
returns table(id uuid,user_id uuid,checkin_date date,caption text,photo_path text,created_at timestamptz,display_name text)
language plpgsql security definer stable set search_path='' as $$
declare selected_community uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select community_id into selected_community from public.community_memberships where user_id=auth.uid();
 if selected_community is null then return; end if;
 return query
 select c.id,c.user_id,c.checkin_date,c.caption,c.photo_path,c.created_at,p.display_name
 from public.checkins c
 join public.community_memberships m on m.user_id=c.user_id and m.community_id=selected_community
 join public.profiles p on p.id=c.user_id
 where c.shared
 order by c.created_at desc limit 30;
end $$;
revoke all on function public.my_community_feed() from public,anon;
grant execute on function public.my_community_feed() to authenticated;

commit;
