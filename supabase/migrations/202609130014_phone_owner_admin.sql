begin;

-- Move the owner role to the account whose verified profile phone is 7816313110.
-- The role itself remains bound to that account UUID, not exposed to the client.
with phone_owner as (
  select user_id from public.member_onboarding
  where regexp_replace(coalesce(phone,''),'\D','','g')='7816313110'
), removed as (
  delete from public.app_admins
  where user_id in (select id from auth.users where lower(email)='587bvvp2ys@privaterelay.appleid.com')
    and exists(select 1 from phone_owner)
)
insert into public.app_admins(user_id)
select user_id from phone_owner
on conflict do nothing;

commit;
