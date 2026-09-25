-- RETURNS TABLE creates PL/pgSQL variables named user_id and community_id;
-- qualify membership columns to avoid an ambiguous-column error at runtime.
create or replace function public.my_community_feed()
returns table(id uuid,user_id uuid,checkin_date date,caption text,photo_path text,created_at timestamptz,display_name text)
language plpgsql security definer stable set search_path='' as $$
declare selected_community uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select membership.community_id into selected_community
 from public.community_memberships as membership
 where membership.user_id=auth.uid();
 if selected_community is null then return; end if;
 return query
 select c.id,c.user_id,c.checkin_date,c.caption,c.photo_path,c.created_at,p.display_name
 from public.checkins as c
 join public.community_memberships as membership on membership.user_id=c.user_id and membership.community_id=selected_community
 join public.profiles as p on p.id=c.user_id
 where c.shared
 order by c.created_at desc limit 30;
end $$;
