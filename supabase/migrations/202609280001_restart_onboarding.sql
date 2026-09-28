begin;

-- Restart signup without deleting the Auth identity, payment records, or the
-- appAccountToken UUID that Apple associates with this member.
create function public.restart_onboarding() returns void
language plpgsql security definer set search_path='' as $$
declare member_id uuid := auth.uid();
begin
  if member_id is null then raise exception 'Sign in first.'; end if;
  delete from public.member_onboarding where user_id=member_id;
end $$;

revoke all on function public.restart_onboarding() from public,anon;
grant execute on function public.restart_onboarding() to authenticated;

commit;
