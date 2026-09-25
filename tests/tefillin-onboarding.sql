-- Disposable fixtures only. All changes roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); n integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (u,u||'@example.com','{"timezone":"America/New_York"}'),
 (v,v||'@example.com','{"timezone":"America/New_York"}');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.complete_onboarding_v2('Test Member','Test School','2005-09-13','ashkenazi',false,'needs_help','America/New_York');
 if not exists(select 1 from public.member_onboarding where user_id=u and owns_tefillin=false and borrow_source='needs_help' and religiosity is null) then raise exception 'New onboarding not saved'; end if;
 perform public.complete_onboarding_v2('Overwrite',null,null,'sephardic',true,null,'America/New_York');
 if (select full_name from public.member_onboarding where user_id=u)<>'Test Member' then raise exception 'Repeat overwrote profile'; end if;
 perform set_config('request.jwt.claim.sub',v::text,true);
 perform public.complete_onboarding_v2('Other Member',null,null,'sephardic',true,null,'America/New_York');
 set local role authenticated;
 select count(*) into n from public.member_onboarding;
 if n<>1 then raise exception 'Private profiles exposed'; end if;
 perform public.set_tefillin_access(false,'friend');
 if not exists(select 1 from public.member_onboarding where user_id=v and owns_tefillin=false and borrow_source='friend') then raise exception 'Update failed'; end if;
 begin
  perform public.set_tefillin_access(false,null);
  raise exception 'Missing borrow source accepted';
 exception when others then if sqlerrm='Missing borrow source accepted' then raise; end if; end;
 perform public.set_tefillin_access(true,'friend');
 if not exists(select 1 from public.member_onboarding where user_id=v and owns_tefillin=true and borrow_source is null) then raise exception 'Ownership did not clear borrowing'; end if;
 set local role postgres;
 if (select borrow_source from public.member_onboarding where user_id=u)<>'needs_help' then raise exception 'Another member changed'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.set_tefillin_access(true,null);
  raise exception 'Unauthenticated update accepted';
 exception when others then if sqlerrm='Unauthenticated update accepted' then raise; end if; end;
 if has_function_privilege('anon','public.complete_onboarding_v2(text,text,date,text,boolean,text,text)','EXECUTE') or has_table_privilege('authenticated','public.member_onboarding','UPDATE') then raise exception 'Unexpected permissions'; end if;
end $$;
select 'PASS: profile save, optional fields, retries, ownership updates, validation, RLS isolation and authentication' as result;
rollback;
