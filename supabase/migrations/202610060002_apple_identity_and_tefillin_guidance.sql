begin;

-- Apple may withhold the name on returning sign-ins. Do not require disclosure
-- again; store a blank private name and keep the public display name separate.
alter table public.member_onboarding drop constraint if exists member_onboarding_full_name_check;
alter table public.member_onboarding add constraint member_onboarding_full_name_check check(length(trim(full_name)) between 0 and 80);
alter table public.member_onboarding drop constraint if exists valid_tefillin_access;
update public.member_onboarding set tefillin_goal_enabled=false;


create or replace function public.complete_onboarding_v2(
 p_full_name text,p_gender text,p_phone text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text
) returns void language plpgsql security definer set search_path='' as $$
declare
 member_id uuid:=auth.uid();
 normalized_phone text:=regexp_replace(coalesce(p_phone,''),'\D','','g');
 formatted_phone text;
 local_today date;
 resolved_name text:=trim(coalesce(p_full_name,''));
 apple_member boolean;
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 -- The paywall Back action revisits only community selection after the private
 -- profile has been saved. Do not revalidate answers that step does not ask.
 if exists(select 1 from public.member_onboarding where user_id=member_id) then return; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 local_today:=(now() at time zone p_timezone)::date;
 if p_birthday is null or p_birthday>(local_today - interval '13 years')::date then
  raise exception 'You must be at least 13 years old to create an account.';
 end if;
 if p_owns_tefillin is null then raise exception 'Choose whether you own tefillin.'; end if;
 select exists(select 1 from auth.identities where user_id=member_id and provider='apple') into apple_member;
 if resolved_name='' and apple_member then
  select left(trim(coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''),'')),80) into resolved_name from auth.users where id=member_id;
 end if;
 if length(resolved_name)>80 or (resolved_name='' and not apple_member) then raise exception 'Enter your full name.'; end if;
 if length(normalized_phone)<>10 then raise exception 'Enter a 10-digit phone number.'; end if;
 formatted_phone:='('||substr(normalized_phone,1,3)||') '||substr(normalized_phone,4,3)||'-'||substr(normalized_phone,7,4);
 insert into public.member_onboarding(user_id,full_name,phone,school,birthday,tradition,owns_tefillin,borrow_source)
 values(member_id,resolved_name,formatted_phone,nullif(trim(p_school),''),p_birthday,p_tradition,p_owns_tefillin,null);
 update public.profiles set display_name=coalesce(nullif(split_part(resolved_name,' ',1),''),nullif(display_name,''),'Member'),timezone=coalesce(timezone,p_timezone) where id=member_id;
end $$;

create or replace function public.update_member_profile(
 p_full_name text,p_phone text,p_school text,p_birthday date
) returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid(); normalized_phone text:=regexp_replace(coalesce(p_phone,''),'\D','','g'); formatted_phone text; resolved_name text:=trim(coalesce(p_full_name,''));
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if length(resolved_name)>80 or (resolved_name='' and not exists(select 1 from auth.identities where user_id=member_id and provider='apple')) then raise exception 'Enter your full name.'; end if;
 if p_phone is not null and trim(p_phone)<>'' and length(normalized_phone)<>10 then raise exception 'Enter a 10-digit phone number.'; end if;
 if p_birthday > current_date then raise exception 'Birthday cannot be in the future.'; end if;
 formatted_phone:=case when normalized_phone='' then null else '('||substr(normalized_phone,1,3)||') '||substr(normalized_phone,4,3)||'-'||substr(normalized_phone,7,4) end;
 update public.member_onboarding set full_name=resolved_name,phone=formatted_phone,school=nullif(trim(coalesce(p_school,'')),''),birthday=p_birthday where user_id=member_id;
 if not found then raise exception 'Complete your profile first.'; end if;
 update public.profiles set display_name=coalesce(nullif(split_part(resolved_name,' ',1),''),nullif(display_name,''),'Member') where id=member_id;
end $$;


-- Retain the old ownership RPC signature for compatible clients, but borrowing
-- choices and purchasing goals are no longer part of the app.
create or replace function public.set_tefillin_access(p_owns_tefillin boolean,p_borrow_source text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_owns_tefillin is null then raise exception 'Choose whether you own tefillin.'; end if;
 update public.member_onboarding set owns_tefillin=p_owns_tefillin,borrow_source=null,tefillin_goal_enabled=false where user_id=auth.uid();
 if not found then raise exception 'Complete your profile first.'; end if;
end $$;
create or replace function public.set_tefillin_goal(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Tefillin purchasing is no longer available. Contact your nearest Chabad center to arrange tefillin to use.';
end $$;

revoke all on function public.set_tefillin_goal(boolean) from public,anon,authenticated,service_role;
commit;
