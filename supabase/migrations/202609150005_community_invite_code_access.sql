begin;

-- Invite codes are visible only to an active administrator of the community.
create or replace function public.community_invite_code(p_community_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if not public.is_community_admin(p_community_id) then raise exception 'Community admin access required.'; end if;
 select join_code into code from public.communities where id=p_community_id and active;
 if code is null then raise exception 'Community is not available.'; end if;
 return code;
end $$;
revoke all on function public.community_invite_code(uuid) from public,anon;
grant execute on function public.community_invite_code(uuid) to authenticated;

commit;
