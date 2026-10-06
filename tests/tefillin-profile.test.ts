import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onboardingSteps,ageOnDate} from '../src/onboarding-data.ts';

test('onboarding collects tefillin ownership without borrowing or religiosity',()=>{
 assert.deepEqual(onboardingSteps(),['Full Name','Phone Number','School','Birthday','Tradition','Do you own tefillin?','Community']);
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
test('nonowners receive Chabad guidance and cannot activate a removed purchasing goal',()=>{
 const flow=readFileSync(new URL('../src/OnboardingFlow.tsx',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/202610060002_apple_identity_and_tefillin_guidance.sql',import.meta.url),'utf8');
 assert.match(flow,/values\.ownsTefillin===false&&<Text[^>]*>Contact your nearest Chabad center/);
 assert.doesNotMatch(flow,/Choose a borrowing option|label:'Friend'|label:'I need help'/);
 assert.match(migration,/update public\.member_onboarding set tefillin_goal_enabled=false/);
 assert.match(migration,/raise exception 'Tefillin purchasing is no longer available/);
});
