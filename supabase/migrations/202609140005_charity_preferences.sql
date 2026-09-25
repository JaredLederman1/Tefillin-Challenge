alter table public.profiles alter column contribution_cents set default 180;

alter table public.donation_causes add column if not exists description text;
alter table public.donation_causes add column if not exists website_url text;

with charities(name,description,website_url) as (values
 ('United Hatzalah','Volunteer emergency medical responders providing rapid, free lifesaving care throughout Israel.','https://israelrescue.org/mission/'),
 ('American Friends of Magen David Adom','Supports Magen David Adom, Israel''s national emergency medical, ambulance, and blood-services organization.','https://afmda.org/'),
 ('Leket Israel','Rescues nutritious surplus food and distributes it through nonprofit partners to people facing food insecurity.','https://www.leket.org/en/about-leket/'),
 ('Friends of the IDF','Supports the health, wellbeing, and education of Israeli soldiers and their families.','https://www.fidf.org/about-us/'),
 ('Jewish National Fund-USA','Supports community building, water, forestry, research, accessibility, and education initiatives in Israel.','https://www.jnf.org/about-jnf')
), modes(livemode) as (values(false),(true))
insert into public.donation_causes(name,livemode,enabled,description,website_url)
select c.name,m.livemode,true,c.description,c.website_url from charities c cross join modes m
where not exists(select 1 from public.donation_causes d where d.name=c.name and d.livemode=m.livemode);

with charities(name,description,website_url) as (values
 ('United Hatzalah','Volunteer emergency medical responders providing rapid, free lifesaving care throughout Israel.','https://israelrescue.org/mission/'),
 ('American Friends of Magen David Adom','Supports Magen David Adom, Israel''s national emergency medical, ambulance, and blood-services organization.','https://afmda.org/'),
 ('Leket Israel','Rescues nutritious surplus food and distributes it through nonprofit partners to people facing food insecurity.','https://www.leket.org/en/about-leket/'),
 ('Friends of the IDF','Supports the health, wellbeing, and education of Israeli soldiers and their families.','https://www.fidf.org/about-us/'),
 ('Jewish National Fund-USA','Supports community building, water, forestry, research, accessibility, and education initiatives in Israel.','https://www.jnf.org/about-jnf')
)
update public.donation_causes d set enabled=true,description=c.description,website_url=c.website_url
from charities c where d.name=c.name;

create table public.member_charity_preferences(
 user_id uuid not null references public.profiles(id) on delete cascade,
 livemode boolean not null,
 cause_id uuid not null references public.donation_causes(id),
 updated_at timestamptz not null default now(),
 primary key(user_id,livemode)
);
alter table public.member_charity_preferences enable row level security;
revoke all on public.member_charity_preferences from anon,authenticated;
grant select on public.member_charity_preferences to authenticated;
create policy own_charity_preference on public.member_charity_preferences for select to authenticated using(user_id=auth.uid());

create or replace function public.set_charity_preference(cause uuid,mode boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.donation_causes where id=cause and livemode=mode and enabled) then raise exception 'Choose an available charity'; end if;
 insert into public.member_charity_preferences(user_id,livemode,cause_id,updated_at)
 values(auth.uid(),mode,cause,now())
 on conflict(user_id,livemode) do update set cause_id=excluded.cause_id,updated_at=now();
end $$;
revoke all on function public.set_charity_preference(uuid,boolean) from public;
grant execute on function public.set_charity_preference(uuid,boolean) to authenticated;
