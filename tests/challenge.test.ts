import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePool, parseContribution, isShabbat, monthDays, streak, dateKey } from '../src/challenge.ts';
test('allocation is weighted by contributions and conserves every cent', () => {
  const r = allocatePool([{id:'a',cents:1800,completed:true},{id:'b',cents:3600,completed:true},{id:'c',cents:1000,completed:false}]);
  assert.deepEqual(r.rewards, [{id:'b',rewardCents:667},{id:'a',rewardCents:333}]);
});
test('no finishers rolls the pool forward; all finishers receive no bonus', () => {
  assert.equal(allocatePool([{id:'a',cents:500,completed:false}]).rolloverCents, 500);
  assert.equal(allocatePool([{id:'a',cents:500,completed:true}]).rewards[0].rewardCents, 0);
});
test('contribution precision and minimum are enforced', () => {
  assert.equal(parseContribution('18.25'),1825);
  for (const value of ['4.99','NaN','-5','18.123','1e3','']) assert.throws(() => parseContribution(value));
});
test('calendar excludes Saturday and handles leap years', () => {
  assert.equal(isShabbat('2026-09-12'), true);
  assert.equal(monthDays('2028-02-01').length,29);
  assert.equal(streak(['2026-09-10','2026-09-11','2026-09-13'],'2026-09-13'),3);
  assert.equal(streak(['2026-09-11'],'2026-09-14'),0);
});
test('local date respects timezone around midnight', () => {
  assert.equal(dateKey(new Date('2026-09-12T02:00:00Z'),'America/New_York'),'2026-09-11');
});
