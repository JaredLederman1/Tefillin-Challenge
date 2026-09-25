import {HebrewCalendar,flags} from '@hebcal/core';
import {readFileSync,writeFileSync} from 'node:fs';
const days=[];
for(let year=2020;year<=2040;year++)for(const e of HebrewCalendar.calendar({year,il:false}))if(e.getFlags()&flags.CHOL_HAMOED){const d=e.greg();days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}
let sql=`-- Generated from @hebcal/core. Diaspora, 2020–2040. Optional wraps never affect qualification.\nbegin;\nalter table public.wrap_calendar_exemptions add column optional_wrap boolean not null default false;\ninsert into public.wrap_calendar_exemptions(day,optional_wrap)\nselect unnest(string_to_array('${[...new Set(days)].sort().join(',')}',','))::date,true\non conflict(day) do nothing;\ncreate function public.can_post_wrap(d date) returns boolean language sql stable security definer set search_path='' as $$\n select public.is_required_wrap_day(d) or (extract(dow from d)<>6 and exists(select 1 from public.wrap_calendar_exemptions where day=d and optional_wrap));\n$$;\nrevoke all on function public.can_post_wrap(date) from public,anon;\ngrant execute on function public.can_post_wrap(date) to authenticated,service_role;\n`;
const old=readFileSync('supabase/migrations/202609130002_calendar_and_comments.sql','utf8');
sql+=old.slice(old.indexOf('create or replace function public.submit_checkin'),old.indexOf('create or replace function public.settle_net_month')).replace('not public.is_required_wrap_day(local_day)','not public.can_post_wrap(local_day)');
writeFileSync('supabase/migrations/202609130004_chol_hamoed.sql',sql+'commit;\n');
console.log([...new Set(days)].sort().join(','));
