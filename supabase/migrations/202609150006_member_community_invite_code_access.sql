begin;

-- Every current member can invite others to their own community.
create or replace function public.community_invite_code(p_community_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if not public.is_community_member(p_community_id) then raise exception 'Join this community to access its invite code.'; end if;
 select join_code into code from public.communities where id=p_community_id and active;
 if code is null then raise exception 'Community is not available.'; end if;
 return code;
end $$;

commit;
