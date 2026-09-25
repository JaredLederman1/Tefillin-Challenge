begin;

-- Ownership and borrowing preferences stay in the owner-only onboarding table.
-- Keep historical answers for older builds, but new signups no longer ask religiosity.
alter table public.member_onboarding alter column religiosity drop not null;
alter table public.member_onboarding add column owns_tefillin boolean;
alter table public.member_onboarding add column borrow_source text
 check (borrow_source in ('campus_chabad','friend','needs_help'));
alter table public.member_onboarding add constraint valid_tefillin_access check (
 (owns_tefillin is null and borrow_source is null)
 or (owns_tefillin is true and borrow_source is null)
 or (owns_tefillin is false and borrow_source is not null)
);

create function public.complete_onboarding_v2(
 p_full_name text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text
) returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid();
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if p_owns_tefillin is null then raise exception 'Choose whether you own tefillin.'; end if;
 if p_owns_tefillin is false and (p_borrow_source is null or p_borrow_source not in ('campus_chabad','friend','needs_help'))
 then raise exception 'Choose a borrowing option.'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 80 then raise exception 'Enter your full name.'; end if;
 if p_birthday>(now() at time zone p_timezone)::date then raise exception 'Birthday cannot be in the future.'; end if;
 if exists(select 1 from public.member_onboarding where user_id=member_id) then return; end if;
 insert into public.member_onboarding(user_id,full_name,school,birthday,tradition,owns_tefillin,borrow_source)
 values(member_id,trim(p_full_name),nullif(trim(p_school),''),p_birthday,p_tradition,p_owns_tefillin,
 case when p_owns_tefillin then null else p_borrow_source end);
 update public.profiles set display_name=split_part(trim(p_full_name),' ',1),timezone=coalesce(timezone,p_timezone) where id=member_id;
end $$;
revoke all on function public.complete_onboarding_v2(text,text,date,text,boolean,text,text) from public,anon;
grant execute on function public.complete_onboarding_v2(text,text,date,text,boolean,text,text) to authenticated;

create function public.set_tefillin_access(p_owns_tefillin boolean,p_borrow_source text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_owns_tefillin is null then raise exception 'Choose whether you own tefillin.'; end if;
 if p_owns_tefillin is false and (p_borrow_source is null or p_borrow_source not in ('campus_chabad','friend','needs_help'))
 then raise exception 'Choose a borrowing option.'; end if;
 update public.member_onboarding set owns_tefillin=p_owns_tefillin,
 borrow_source=case when p_owns_tefillin then null else p_borrow_source end where user_id=auth.uid();
 if not found then raise exception 'Complete your profile first.'; end if;
end $$;
revoke all on function public.set_tefillin_access(boolean,text) from public,anon;
grant execute on function public.set_tefillin_access(boolean,text) to authenticated;

commit;
