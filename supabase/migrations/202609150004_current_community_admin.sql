begin;

-- An admin role only grants community administration while the person remains
-- a current member of that same community.
create or replace function public.is_community_admin(p_community_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.community_admins a
  join public.community_memberships m on m.community_id=a.community_id and m.user_id=a.user_id
  where a.user_id=auth.uid() and a.community_id=p_community_id
 )
$$;

create or replace function public.my_admin_communities()
returns table(community_id uuid,community_name text)
language sql stable security definer set search_path='' as $$
 select c.id,c.name from public.community_admins a
 join public.community_memberships m on m.community_id=a.community_id and m.user_id=a.user_id
 join public.communities c on c.id=a.community_id
 where a.user_id=auth.uid() and c.active
 order by c.name
$$;

commit;
