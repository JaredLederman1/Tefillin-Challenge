begin;

alter table public.communities add column if not exists location text;
alter table public.communities add column if not exists school text;
alter table public.communities add column if not exists join_code text;
create unique index if not exists communities_join_code_key on public.communities(join_code) where join_code is not null;
alter table public.communities add constraint communities_join_code_format check(join_code is null or join_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$') not valid;

create or replace function public.new_community_join_code() returns text
language plpgsql volatile set search_path='' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i integer;
begin
 for i in 1..6 loop result := result || substr(alphabet,1 + floor(random() * length(alphabet))::integer,1); end loop;
 return result;
end $$;

update public.communities set join_code=public.new_community_join_code() where join_code is null;
alter table public.communities alter column join_code set not null;
alter table public.communities validate constraint communities_join_code_format;

create or replace function public.join_community_by_code(p_join_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare selected_community uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if not exists(select 1 from public.member_onboarding where user_id=auth.uid()) then raise exception 'Complete your profile first.'; end if;
 select id into selected_community from public.communities where join_code=upper(trim(coalesce(p_join_code,''))) and active;
 if selected_community is null then raise exception 'That community code is not valid.'; end if;
 insert into public.community_memberships(user_id,community_id) values(auth.uid(),selected_community)
 on conflict(user_id) do update set community_id=excluded.community_id,joined_at=now();
 return selected_community;
end $$;
revoke all on function public.join_community_by_code(text) from public,anon;
grant execute on function public.join_community_by_code(text) to authenticated;

-- Older clients could select a public name and send its UUID directly. Keep
-- their leave behavior, but require an invite code for every new membership.
create or replace function public.set_my_community(p_community_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_community_id is not null then raise exception 'Use a community invite code to join.'; end if;
 delete from public.community_memberships where user_id=auth.uid();
end $$;

create or replace function public.create_my_community(p_name text,p_location text,p_school text)
returns table(community_id uuid, community_name text, join_code text)
language plpgsql security definer set search_path='' as $$
declare created_community uuid; generated_code text; attempts integer := 0;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if not exists(select 1 from public.member_onboarding where user_id=auth.uid()) then raise exception 'Complete your profile first.'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Enter a community name.'; end if;
 if exists(select 1 from public.community_memberships where user_id=auth.uid()) then raise exception 'Leave your current community before creating one.'; end if;
 loop
  generated_code := public.new_community_join_code();
  begin
   insert into public.communities(name,location,school,join_code) values(trim(p_name),nullif(trim(p_location),''),nullif(trim(p_school),''),generated_code) returning id into created_community;
   exit;
  exception when unique_violation then
   attempts := attempts + 1; if attempts >= 5 then raise; end if;
  end;
 end loop;
 insert into public.community_memberships(user_id,community_id) values(auth.uid(),created_community);
 insert into public.community_admins(community_id,user_id) values(created_community,auth.uid());
 return query select created_community,trim(p_name),generated_code;
end $$;
revoke all on function public.create_my_community(text,text,text) from public,anon;
grant execute on function public.create_my_community(text,text,text) to authenticated;

create or replace function public.complete_onboarding_with_community_code(
 p_full_name text,p_gender text,p_phone text,p_school text,p_birthday date,p_tradition text,
 p_owns_tefillin boolean,p_borrow_source text,p_timezone text,p_community_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_community uuid;
begin
 perform public.complete_onboarding_v2(p_full_name,p_gender,p_phone,p_school,p_birthday,p_tradition,p_owns_tefillin,p_borrow_source,p_timezone);
 if nullif(trim(coalesce(p_community_code,'')),'') is not null then selected_community := public.join_community_by_code(p_community_code); end if;
 return selected_community;
end $$;
revoke all on function public.complete_onboarding_with_community_code(text,text,text,text,date,text,boolean,text,text,text) from public,anon;
grant execute on function public.complete_onboarding_with_community_code(text,text,text,text,date,text,boolean,text,text,text) to authenticated;

commit;
