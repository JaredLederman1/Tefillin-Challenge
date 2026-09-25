-- Generated from @hebcal/core. Diaspora, 2020–2040. Optional wraps never affect qualification.
begin;
alter table public.wrap_calendar_exemptions add column optional_wrap boolean not null default false;
insert into public.wrap_calendar_exemptions(day,optional_wrap)
select unnest(string_to_array('2020-04-11,2020-04-12,2020-04-13,2020-04-14,2020-10-05,2020-10-06,2020-10-07,2020-10-08,2020-10-09,2021-03-30,2021-03-31,2021-04-01,2021-04-02,2021-09-23,2021-09-24,2021-09-25,2021-09-26,2021-09-27,2022-04-18,2022-04-19,2022-04-20,2022-04-21,2022-10-12,2022-10-13,2022-10-14,2022-10-15,2022-10-16,2023-04-08,2023-04-09,2023-04-10,2023-04-11,2023-10-02,2023-10-03,2023-10-04,2023-10-05,2023-10-06,2024-04-25,2024-04-26,2024-04-27,2024-04-28,2024-10-19,2024-10-20,2024-10-21,2024-10-22,2024-10-23,2025-04-15,2025-04-16,2025-04-17,2025-04-18,2025-10-09,2025-10-10,2025-10-11,2025-10-12,2025-10-13,2026-04-04,2026-04-05,2026-04-06,2026-04-07,2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2027-04-24,2027-04-25,2027-04-26,2027-04-27,2027-10-18,2027-10-19,2027-10-20,2027-10-21,2027-10-22,2028-04-13,2028-04-14,2028-04-15,2028-04-16,2028-10-07,2028-10-08,2028-10-09,2028-10-10,2028-10-11,2029-04-02,2029-04-03,2029-04-04,2029-04-05,2029-09-26,2029-09-27,2029-09-28,2029-09-29,2029-09-30,2030-04-20,2030-04-21,2030-04-22,2030-04-23,2030-10-14,2030-10-15,2030-10-16,2030-10-17,2030-10-18,2031-04-10,2031-04-11,2031-04-12,2031-04-13,2031-10-04,2031-10-05,2031-10-06,2031-10-07,2031-10-08,2032-03-29,2032-03-30,2032-03-31,2032-04-01,2032-09-22,2032-09-23,2032-09-24,2032-09-25,2032-09-26,2033-04-16,2033-04-17,2033-04-18,2033-04-19,2033-10-10,2033-10-11,2033-10-12,2033-10-13,2033-10-14,2034-04-06,2034-04-07,2034-04-08,2034-04-09,2034-09-30,2034-10-01,2034-10-02,2034-10-03,2034-10-04,2035-04-26,2035-04-27,2035-04-28,2035-04-29,2035-10-20,2035-10-21,2035-10-22,2035-10-23,2035-10-24,2036-04-14,2036-04-15,2036-04-16,2036-04-17,2036-10-08,2036-10-09,2036-10-10,2036-10-11,2036-10-12,2037-04-02,2037-04-03,2037-04-04,2037-04-05,2037-09-26,2037-09-27,2037-09-28,2037-09-29,2037-09-30,2038-04-22,2038-04-23,2038-04-24,2038-04-25,2038-10-16,2038-10-17,2038-10-18,2038-10-19,2038-10-20,2039-04-11,2039-04-12,2039-04-13,2039-04-14,2039-10-05,2039-10-06,2039-10-07,2039-10-08,2039-10-09,2040-03-31,2040-04-01,2040-04-02,2040-04-03,2040-09-24,2040-09-25,2040-09-26,2040-09-27,2040-09-28',','))::date,true
on conflict(day) do nothing;
create function public.can_post_wrap(d date) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_required_wrap_day(d) or (extract(dow from d)<>6 and exists(select 1 from public.wrap_calendar_exemptions where day=d and optional_wrap));
$$;
revoke all on function public.can_post_wrap(date) from public,anon;
grant execute on function public.can_post_wrap(date) to authenticated,service_role;
create or replace function public.submit_checkin(photo_path text, photo_caption text default '', is_shared boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare member_id uuid := auth.uid(); local_day date; result_id uuid; member_tz text;
begin
  if member_id is null then raise exception 'Sign in before posting a wrap.'; end if;
  select p.timezone into member_tz from public.profiles p where p.id=member_id;
  if member_tz is null then raise exception 'Your profile is not ready.'; end if;
  local_day := (now() at time zone member_tz)::date;
  if not public.can_post_wrap(local_day) then raise exception 'No wrap required on Shabbat or Yom Tov.'; end if;
  if public.wrap_comment_words(photo_caption)>10 then raise exception 'Comments must be 10 words or fewer.'; end if;
  if split_part(photo_path,'/',1) <> member_id::text then raise exception 'Invalid photo owner.'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='checkins' and o.name=photo_path and o.created_at >= now()-interval '1 hour') then raise exception 'Upload a new photo first.'; end if;
  insert into public.checkins(user_id,checkin_date,photo_path,caption,shared)
  values(member_id,local_day,photo_path,coalesce(photo_caption,''),is_shared) returning id into result_id;
  return result_id;
end;
$$;
commit;
