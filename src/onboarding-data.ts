export type BorrowSource = 'campus_chabad'|'friend'|'needs_help';
export type OnboardingValues = {fullName:string;gender:'man'|'woman'|null;phone:string;school:string;birthday:string;tradition:'ashkenazi'|'sephardic'|null;ownsTefillin:boolean|null;borrowSource:BorrowSource|null;communityCode:string};
export type CommunityOption = {id:string;name:string};
export type MemberDetails = {
 full_name:string; gender:'man'|'woman'|null; phone:string|null; school:string|null; birthday:string|null;
 tradition:'ashkenazi'|'sephardic'; tefillin_goal_enabled:boolean;
};
export function onboardingSteps() { return ['Full Name','Gender','Phone Number','School','Birthday','Tradition','Do you own tefillin?','Borrowing','Community']; }
export function ageOnDate(birthday:string|null|undefined,today:string):number|null {
 if(!birthday||!/^\d{4}-\d{2}-\d{2}$/.test(birthday))return null;
 const [year,month,day]=birthday.split('-').map(Number);
 const [nowYear,nowMonth,nowDay]=today.split('-').map(Number);
 const age=nowYear-year-(nowMonth<month||(nowMonth===month&&nowDay<day)?1:0);
 return Number.isFinite(age)&&age>=0?age:null;
}
export function minimumSignupBirthday(today=new Date()) {
 const cutoff=new Date(today.getFullYear()-13,today.getMonth(),today.getDate());
 if(cutoff.getMonth()!==today.getMonth())cutoff.setDate(0);
 return `${String(cutoff.getMonth()+1).padStart(2,'0')}/${String(cutoff.getDate()).padStart(2,'0')}/${cutoff.getFullYear()}`;
}
export function tefillinGoalProgress(balanceCents:number,targetCents=35000) {
 const available=Math.max(0,Number.isFinite(balanceCents)?balanceCents:0);
 return {available,remaining:Math.max(0,targetCents-available),percent:Math.min(100,available/targetCents*100)};
}
export function phoneDigits(value:string) { return value.replace(/\D/g,'').slice(0,10); }
export function formatUsPhone(value:string) {
  const digits=phoneDigits(value);
  if(digits.length<=3)return digits?`(${digits}`:'';
  if(digits.length<=6)return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export function parseBirthday(input: string, today = new Date()): string | null {
  if (!input.trim()) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) throw new Error('Enter your birthday as MM/DD/YYYY, or skip this step.');
  const [,m,d,y]=match; const year=Number(y),month=Number(m),day=Number(d);
  const date=new Date(Date.UTC(year,month-1,day));
  if(year<1900 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day || date.getTime()>Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())) throw new Error('Enter a valid birthday in the past, or skip this step.');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

export function birthdayForInput(value:string|null|undefined) {
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');
 return match?`${match[2]}/${match[3]}/${match[1]}`:value||'';
}

export function defaultBirthday(today=new Date()) {return clampBirthday(2000,1,1,today);}
export function clampBirthday(year:number,month:number,day:number,today=new Date()) {
  year=Math.max(1900,Math.min(today.getFullYear(),year));
  month=Math.max(1,Math.min(year===today.getFullYear()?today.getMonth()+1:12,month));
  const lastDay=year===today.getFullYear()&&month===today.getMonth()+1?today.getDate():new Date(year,month,0).getDate();
  day=Math.max(1,Math.min(lastDay,day));
  return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year}`;
}
export function clampSignupBirthday(year:number,month:number,day:number,today=new Date()) {
 const [maxMonth,maxDay,maxYear]=minimumSignupBirthday(today).split('/').map(Number);
 year=Math.max(1900,Math.min(maxYear,year));
 month=Math.max(1,Math.min(year===maxYear?maxMonth:12,month));
 const lastDay=year===maxYear&&month===maxMonth?maxDay:new Date(year,month,0).getDate();
 day=Math.max(1,Math.min(lastDay,day));
 return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year}`;
}
