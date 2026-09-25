begin;
-- Keep sensitive onboarding details separate from publicly readable member profiles.
create table public.member_onboarding (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 1 and 80),
 school text check(school is null or length(school)<=120),
 birthday date check(birthday is null or birthday>=date '1900-01-01'),
 tradition text not null check(tradition in ('ashkenazi','sephardic')),
 religiosity smallint not null check(religiosity between 1 and 5),
 completed_at timestamptz not null default now()
);
alter table public.member_onboarding enable row level security;
revoke all on public.member_onboarding from public,anon,authenticated;
grant select on public.member_onboarding to authenticated;
create policy own_onboarding_read on public.member_onboarding for select to authenticated using(user_id=auth.uid());
create function public.complete_onboarding(p_full_name text,p_school text,p_birthday date,p_tradition text,p_religiosity integer,p_timezone text)
returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid();
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 if p_birthday>(now() at time zone p_timezone)::date then raise exception 'Birthday cannot be in the future.'; end if;
 if exists(select 1 from public.member_onboarding where user_id=member_id) then return; end if;
 insert into public.member_onboarding(user_id,full_name,school,birthday,tradition,religiosity)
 values(member_id,trim(p_full_name),nullif(trim(p_school),''),p_birthday,p_tradition,p_religiosity);
 -- Only the first name enters the community profile. Religious preferences remain private.
 update public.profiles set display_name=split_part(trim(p_full_name),' ',1),timezone=coalesce(timezone,p_timezone) where id=member_id;
end $$;
revoke all on function public.complete_onboarding(text,text,date,text,integer,text) from public,anon;
grant execute on function public.complete_onboarding(text,text,date,text,integer,text) to authenticated;
commit;
