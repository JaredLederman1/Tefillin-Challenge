-- Run against a disposable migrated database; every fixture rolls back.
begin;
do $$
declare apple_member uuid:=gen_random_uuid(); email_member uuid:=gen_random_uuid(); failed boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (apple_member,apple_member||'@example.com','{}'),(email_member,email_member||'@example.com','{}');
 insert into auth.identities(id,user_id,provider_id,provider,identity_data)
 values(gen_random_uuid(),apple_member,apple_member::text,'apple',jsonb_build_object('sub',apple_member::text));
 perform set_config('request.jwt.claim.sub',apple_member::text,true);
 perform public.complete_onboarding_v2('',null,'2125550123',null,'2000-01-01','ashkenazi',false,null,'America/New_York');
 if not exists(select 1 from public.member_onboarding where user_id=apple_member and full_name='' and owns_tefillin=false and borrow_source is null and not tefillin_goal_enabled and gender is null) then raise exception 'Apple missing-name onboarding failed'; end if;
 perform public.update_member_profile('','2125550123','Test School','2000-01-01');
 if not exists(select 1 from public.member_onboarding where user_id=apple_member and school='Test School') then raise exception 'Apple profile edits failed'; end if;
 perform public.set_tefillin_access(false,null);
 -- Returning from the paywall asks only community selection. A saved profile
 -- remains intact even when the other step values are absent on this retry.
 perform public.complete_onboarding_v2('',null,null,null,null,null,null,null,'America/New_York');
 if not exists(select 1 from public.member_onboarding where user_id=apple_member and owns_tefillin=false and school='Test School') then raise exception 'Onboarding retry overwrote saved profile'; end if;
 failed:=false;
 begin perform public.set_tefillin_goal(true); exception when others then failed:=true; end;
 if not failed then raise exception 'Removed purchase goal was enabled'; end if;
 perform set_config('request.jwt.claim.sub',email_member::text,true);
 failed:=false;
 begin perform public.complete_onboarding_v2('',null,'2125550123',null,'2000-01-01','ashkenazi',false,null,'America/New_York'); exception when others then failed:=true; end;
 if not failed then raise exception 'Missing non-Apple name accepted'; end if;
 perform public.complete_onboarding_v2('Test Member',null,'2125550123',null,'2000-01-01','ashkenazi',false,null,'America/New_York');
 if not exists(select 1 from public.member_onboarding where user_id=email_member and full_name='Test Member' and borrow_source is null) then raise exception 'Nonowner signup failed'; end if;
end $$;
select 'PASS: Apple missing names, profile edits, nonowner signup, removed goals' as result;
rollback;
