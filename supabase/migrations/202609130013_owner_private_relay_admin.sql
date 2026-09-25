begin;

insert into public.app_admins(user_id)
select id from auth.users where lower(email)='587bvvp2ys@privaterelay.appleid.com'
on conflict do nothing;

commit;
