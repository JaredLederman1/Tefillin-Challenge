begin;
create table public.wrap_confirmations (
 id uuid primary key default gen_random_uuid(),
 checkin_id uuid not null references public.checkins(id) on delete cascade,
 confirmer_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(checkin_id,confirmer_id)
);
alter table public.wrap_confirmations enable row level security;
revoke all on public.wrap_confirmations from public,anon,authenticated;
create function public.confirm_wrap(p_checkin uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member uuid:=auth.uid(); wrap public.checkins%rowtype;
begin
 if member is null then raise exception 'Sign in first'; end if;
 select * into wrap from public.checkins where id=p_checkin for update;
 if not found or not wrap.shared then raise exception 'This wrap is unavailable'; end if;
 if wrap.user_id=member then raise exception 'You cannot confirm your own wrap'; end if;
 if exists(select 1 from public.blocked_users where (blocker_id=member and blocked_user_id=wrap.user_id) or (blocker_id=wrap.user_id and blocked_user_id=member)) then raise exception 'This wrap is unavailable'; end if;
 if wrap.review_status='rejected' then raise exception 'This wrap cannot be confirmed'; end if;
 insert into public.wrap_confirmations(checkin_id,confirmer_id) values(p_checkin,member) on conflict(checkin_id,confirmer_id) do nothing;
 update public.checkins set review_status='approved' where id=p_checkin and review_status='pending';
 return jsonb_build_object('confirmed',true,'count',(select count(*) from public.wrap_confirmations where checkin_id=p_checkin));
end $$;
create function public.wrap_confirmation_status(p_checkins uuid[]) returns table(checkin_id uuid,confirmations bigint,confirmed_by_me boolean)
language sql stable security definer set search_path='' as $$
 select c.id,count(w.id),coalesce(bool_or(w.confirmer_id=auth.uid()),false)
 from public.checkins c left join public.wrap_confirmations w on w.checkin_id=c.id
 where auth.uid() is not null and c.id=any(p_checkins) and (c.shared or c.user_id=auth.uid())
 and not exists(select 1 from public.blocked_users b where (b.blocker_id=auth.uid() and b.blocked_user_id=c.user_id) or (b.blocker_id=c.user_id and b.blocked_user_id=auth.uid()))
 group by c.id;
$$;
revoke all on function public.confirm_wrap(uuid),public.wrap_confirmation_status(uuid[]) from public,anon;
grant execute on function public.confirm_wrap(uuid),public.wrap_confirmation_status(uuid[]) to authenticated;
commit;
