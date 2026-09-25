begin;

-- Match the private profile phone; never grant a role from client-supplied data.
insert into public.community_admins(community_id,user_id)
select c.id,o.user_id
from public.communities c cross join public.member_onboarding o
where c.name='Chabad at Cornell'
 and regexp_replace(coalesce(o.phone,''),'\D','','g')='7816313110'
on conflict do nothing;

commit;
