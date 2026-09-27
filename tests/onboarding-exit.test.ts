import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('first onboarding step has a welcome exit without deleting the account',()=>{
 const flow=readFileSync(new URL('../src/OnboardingFlow.tsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 assert.match(flow,/step===0\?'Back to welcome':'Previous step'/);
 assert.match(flow,/await onExit\(\)/);
 assert.doesNotMatch(flow,/disabled=\{step===0\|\|busy\}/);
 const exit=app.slice(app.indexOf('async function exitOnboarding()'),app.indexOf('async function finishOnboarding'));
 assert.match(exit,/signOut\(\{scope:'local'\}\)/);
 assert.match(exit,/setEntered\(false\)/);
 assert.doesNotMatch(exit,/dev-delete-account/);
 assert.match(app,/<Onboarding onExit=\{exitOnboarding\}/);
});
