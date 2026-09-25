import { flags, HebrewCalendar } from '@hebcal/core';

// Shared challenge policy: Diaspora dates. Chol Hamoed policy is explicit below.
export const EXEMPT_CHOL_HAMOED = true;
const cache = new Map<string, string | null>();
export function wrapExemption(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!;
  const [year, month, day] = key.split('-').map(Number);
  // Construct a local noon from the account's date key, never convert UTC into a different day.
  const date = new Date(year, month - 1, day, 12);
  const events = HebrewCalendar.getHolidaysOnDate(date, false) || [];
  const holiday = events.find(event => !!(event.getFlags() & (flags.CHAG | (EXEMPT_CHOL_HAMOED ? flags.CHOL_HAMOED : 0))));
  const label = date.getDay() === 6 ? 'Shabbat' : holiday ? holiday.render('en').replace(/^Rosh Hashana(?:h)?(?: I| II)?$/, 'Rosh Hashanah') : null;
  cache.set(key, label);
  return label;
}
export function isRequiredWrapDay(key: string) { return wrapExemption(key) === null; }
export function commentWordCount(value: string) { return value.trim() ? value.trim().split(/\s+/u).length : 0; }

// Shabbat and Yom Tov stay camera-free; weekday Chol Hamoed wraps are optional.
export function isCholHamoed(key: string) {
  const [year,month,day]=key.split('-').map(Number);
  const date=new Date(year,month-1,day,12);
  const events=HebrewCalendar.getHolidaysOnDate(date,false)||[];
  return date.getDay()!==6 && !events.some(e=>!!(e.getFlags()&flags.CHAG)) && events.some(e=>!!(e.getFlags()&flags.CHOL_HAMOED));
}
export function canPostWrap(key: string) {
  if (isRequiredWrapDay(key)) return true;
  return isCholHamoed(key);
}
