begin;

create or replace function public.complete_onboarding_v2(
 p_full_name text,p_gender text,p_phone text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text
) returns void language plpgsql security definer set search_path='' as $$
declare
 member_id uuid:=auth.uid();
 normalized_phone text:=regexp_replace(coalesce(p_phone,''),'\D','','g');
 formatted_phone text;
 local_today date;
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 local_today:=(now() at time zone p_timezone)::date;
 if p_birthday is null or p_birthday>(local_today - interval '13 years')::date then
  raise exception 'You must be at least 13 years old to create an account.';
 end if;
 if p_owns_tefillin is false and (p_borrow_source is null or p_borrow_source not in ('campus_chabad','friend','needs_help')) then raise exception 'Choose a borrowing option.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 80 then raise exception 'Enter your full name.'; end if;
 if p_gender not in ('man','woman') then raise exception 'Choose Man or Woman.'; end if;
 if length(normalized_phone)<>10 then raise exception 'Enter a 10-digit phone number.'; end if;
 formatted_phone:='('||substr(normalized_phone,1,3)||') '||substr(normalized_phone,4,3)||'-'||substr(normalized_phone,7,4);
 if exists(select 1 from public.member_onboarding where user_id=member_id) then return; end if;
 insert into public.member_onboarding(user_id,full_name,gender,phone,school,birthday,tradition,owns_tefillin,borrow_source)
 values(member_id,trim(p_full_name),p_gender,formatted_phone,nullif(trim(p_school),''),p_birthday,p_tradition,p_owns_tefillin,case when p_owns_tefillin then null else p_borrow_source end);
 update public.profiles set display_name=split_part(trim(p_full_name),' ',1),timezone=coalesce(timezone,p_timezone) where id=member_id;
end $$;

commit;
