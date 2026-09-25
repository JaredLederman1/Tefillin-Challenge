begin;

alter table public.member_onboarding add column if not exists tefillin_goal_enabled boolean not null default false;

create or replace function public.complete_onboarding_v2(
 p_full_name text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text
) returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid();
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if p_owns_tefillin is false and (p_borrow_source is null or p_borrow_source not in ('campus_chabad','friend','needs_help')) then raise exception 'Choose a borrowing option.'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 80 then raise exception 'Enter your full name.'; end if;
 if p_birthday>(now() at time zone p_timezone)::date then raise exception 'Birthday cannot be in the future.'; end if;
 if exists(select 1 from public.member_onboarding where user_id=member_id) then return; end if;
 insert into public.member_onboarding(user_id,full_name,school,birthday,tradition,owns_tefillin,borrow_source)
 values(member_id,trim(p_full_name),nullif(trim(p_school),''),p_birthday,p_tradition,p_owns_tefillin,case when p_owns_tefillin then null else p_borrow_source end);
 update public.profiles set display_name=split_part(trim(p_full_name),' ',1),timezone=coalesce(timezone,p_timezone) where id=member_id;
end $$;

create or replace function public.set_tefillin_goal(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 update public.member_onboarding set tefillin_goal_enabled=coalesce(p_enabled,false) where user_id=auth.uid();
 if not found then raise exception 'Complete your profile first.'; end if;
end $$;
revoke all on function public.set_tefillin_goal(boolean) from public,anon;
grant execute on function public.set_tefillin_goal(boolean) to authenticated;

commit;
