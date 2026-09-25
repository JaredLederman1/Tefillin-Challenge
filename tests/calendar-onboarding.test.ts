import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wrapExemption,isRequiredWrapDay,canPostWrap,commentWordCount,isCholHamoed} from '../src/calendar.ts';
import {streak} from '../src/challenge.ts';
import {parseBirthday,clampBirthday,defaultBirthday,birthdayForInput} from '../src/onboarding-data.ts';
import {searchUniversities} from '../src/universities.ts';
test('Rosh Hashanah and consecutive Shabbat/holiday days preserve streak without adding days',()=>{
 assert.equal(wrapExemption('2026-09-13'),'Rosh Hashanah');
 assert.equal(streak(['2026-09-10','2026-09-11'],'2026-09-14'),2);
 assert.equal(streak(['2026-09-10','2026-09-11','2026-09-14'],'2026-09-14'),3);
 assert.equal(streak(['2026-09-10','2026-09-11'],'2026-09-15'),0);
});
test('major festivals exempt both Diaspora days; minor holidays remain required',()=>{
 for(const day of ['2026-09-21','2026-09-27','2026-10-04','2026-04-02','2026-04-03','2026-04-08','2026-04-09','2026-05-22','2026-05-23'])assert.equal(isRequiredWrapDay(day),false,day);
 for(const day of ['2026-09-11','2026-09-14','2026-03-03','2026-12-08'])assert.equal(isRequiredWrapDay(day),true,day);
});
test('server exemption dataset agrees with client for every supported day',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/202609130002_calendar_and_comments.sql',import.meta.url),'utf8');
 const extra=readFileSync(new URL('../supabase/migrations/202609130004_chol_hamoed.sql',import.meta.url),'utf8');
 const match=/string_to_array\('([^']+)'/.exec(sql)!;const holidays=new Set([...match[1].split(','),.../string_to_array\('([^']+)'/.exec(extra)![1].split(',')]);
 for(const d=new Date(2020,0,1,12);d.getFullYear()<=2040;d.setDate(d.getDate()+1)){
 const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 assert.equal(isRequiredWrapDay(key),d.getDay()!==6&&!holidays.has(key),key);
 }
});
test('word limit counts repeated spaces, tabs, line breaks, and Unicode spaces',()=>{
 assert.equal(commentWordCount('  '),0);assert.equal(commentWordCount('one\n two\tthree\u00a0four'),4);
 assert.equal(commentWordCount('one two three four five six seven eight nine ten'),10);
 assert.equal(commentWordCount('one two three four five six seven eight nine ten eleven'),11);
});
test('birthday is optional; leap dates valid and impossible or future dates rejected',()=>{
 assert.equal(parseBirthday(''),null);assert.equal(parseBirthday('2/29/2000'),'2000-02-29');
 for(const value of ['02/29/2001','13/01/2000','02/31/2000','01/01/1800','01/01/2100','abc'])assert.throws(()=>parseBirthday(value,new Date(2026,8,13)));
});
test('university suggestions search case-insensitively and allow no match',()=>{
 assert.ok(searchUniversities('new york').includes('New York University'));
 assert.ok(searchUniversities('UCLA').includes('University of California, Los Angeles (UCLA)'));
 assert.deepEqual(searchUniversities(''),[]);assert.deepEqual(searchUniversities('not-a-real-campus-xyz'),[]);
});

test('Chol Hamoed preserves streaks with or without posts, but Shabbat remains blocked',()=>{
 for(const day of ['2026-04-05','2026-09-29']){assert.equal(isRequiredWrapDay(day),false);assert.equal(canPostWrap(day),true);}
 for(const day of ['2026-04-05','2026-09-29'])assert.equal(isCholHamoed(day),true);
 for(const day of ['2026-04-04','2026-04-03','2026-09-13','2026-03-03'])assert.equal(isCholHamoed(day),false);
 for(const day of ['2026-04-04','2026-04-03','2026-09-13'])assert.equal(canPostWrap(day),false);
 assert.equal(streak(['2026-04-01'],'2026-04-10'),1);
 assert.equal(streak(['2026-04-01','2026-04-05'],'2026-04-10'),1);
 assert.equal(streak(['2026-04-01'],'2026-04-12'),0);
});

test('birthday wheels clamp leap dates, short months, and future dates',()=>{
 const today=new Date(2026,8,13);
 assert.equal(clampBirthday(2000,2,31,today),'02/29/2000');
 assert.equal(clampBirthday(2001,2,29,today),'02/28/2001');
 assert.equal(clampBirthday(2000,4,31,today),'04/30/2000');
 assert.equal(clampBirthday(2026,12,31,today),'09/13/2026');
 assert.equal(clampBirthday(1800,1,1,today),'01/01/1900');
});

test('birthday wheels default to January 1, 2000',()=>{
 assert.equal(defaultBirthday(new Date(2026,8,13)),'01/01/2000');
 assert.equal(defaultBirthday(new Date(2024,1,29)),'01/01/2000');
});

test('stored birthdays are formatted for the onboarding wheel',()=>{
 assert.equal(birthdayForInput('2001-02-03'),'02/03/2001');
 assert.equal(birthdayForInput(null),'');
});
