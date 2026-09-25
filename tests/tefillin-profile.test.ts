import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardingSteps,ageOnDate,tefillinGoalProgress} from '../src/onboarding-data.ts';

test('onboarding collects tefillin ownership and borrowing without religiosity',()=>{
 assert.deepEqual(onboardingSteps(),['Full Name','Gender','Phone Number','School','Birthday','Tradition','Do you own tefillin?','Borrowing','Community']);
});
test('age respects birthday boundary and optional birthday',()=>{
 assert.equal(ageOnDate('2005-09-13','2026-09-12'),20);
 assert.equal(ageOnDate('2005-09-13','2026-09-13'),21);
 assert.equal(ageOnDate('2005-09-13','2026-09-14'),21);
 assert.equal(ageOnDate(null,'2026-09-13'),null);
 assert.equal(ageOnDate('2027-01-01','2026-09-13'),null);
 assert.equal(ageOnDate('2004-02-29','2025-02-28'),20);
 assert.equal(ageOnDate('2004-02-29','2025-03-01'),21);
});
test('goal progress clamps without hiding excess balance or promising returns',()=>{
 assert.deepEqual(tefillinGoalProgress(0),{available:0,remaining:35000,percent:0});
 assert.deepEqual(tefillinGoalProgress(17500),{available:17500,remaining:17500,percent:50});
 assert.deepEqual(tefillinGoalProgress(40000),{available:40000,remaining:0,percent:100});
 assert.deepEqual(tefillinGoalProgress(-100),{available:0,remaining:35000,percent:0});
});
