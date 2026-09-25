begin;

create table public.blocked_users(
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_user_id),
 check(blocker_id<>blocked_user_id)
);
alter table public.blocked_users enable row level security;
revoke all on public.blocked_users from public,anon,authenticated;
grant select,insert,delete on public.blocked_users to authenticated;
create policy own_blocks_read on public.blocked_users for select to authenticated using(blocker_id=auth.uid());
create policy own_blocks_insert on public.blocked_users for insert to authenticated with check(blocker_id=auth.uid());
create policy own_blocks_delete on public.blocked_users for delete to authenticated using(blocker_id=auth.uid());

-- Remove the temporary review fixture from production identity and activity data.
delete from auth.users where id='00000000-0000-4000-8000-000000000143';

commit;
