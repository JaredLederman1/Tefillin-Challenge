begin;

create or replace function public.update_member_profile(
 p_full_name text,p_phone text,p_school text,p_birthday date
) returns void language plpgsql security definer set search_path='' as $$
declare member_id uuid:=auth.uid();
begin
 if member_id is null then raise exception 'Sign in first.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 80 then raise exception 'Enter your full name.'; end if;
 if p_phone is not null and trim(p_phone) <> '' and trim(p_phone) !~ '^\+?[0-9(). -]{7,24}$' then raise exception 'Enter a valid phone number.'; end if;
 if p_birthday > current_date then raise exception 'Birthday cannot be in the future.'; end if;
 update public.member_onboarding
 set full_name=trim(p_full_name),phone=nullif(trim(coalesce(p_phone,'')),''),school=nullif(trim(coalesce(p_school,'')),''),birthday=p_birthday
 where user_id=member_id;
 if not found then raise exception 'Complete your profile first.'; end if;
 update public.profiles set display_name=split_part(trim(p_full_name),' ',1) where id=member_id;
end $$;

revoke all on function public.update_member_profile(text,text,text,date) from public,anon;
grant execute on function public.update_member_profile(text,text,text,date) to authenticated;

commit;
