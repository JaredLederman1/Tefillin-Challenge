import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSubscriptionConflict} from '../src/subscription-conflict.ts';
import {readFileSync} from 'node:fs';

test('subscription ownership conflicts offer a start-over route',()=>{
 assert.equal(isSubscriptionConflict('Another App Store subscription is already active.'),true);
 assert.equal(isSubscriptionConflict('This Apple subscription is linked to a different Ratzon account.'),true);
 assert.equal(isSubscriptionConflict('This account is linked to a different subscription.'),true);
 assert.equal(isSubscriptionConflict('Apple could not verify this purchase.'),false);
 assert.equal(isSubscriptionConflict(''),false);
});

test('start over clears onboarding only and retains Apple account ownership',()=>{
 const contribution=readFileSync(new URL('../src/ContributionSetup.tsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/202609280001_restart_onboarding.sql',import.meta.url),'utf8');
 assert.match(contribution,/isSubscriptionConflict\(error\)/);
 assert.match(contribution,/>Start Over</);
 assert.match(contribution,/await onStartOver\(\)/);
 assert.match(app,/onStartOver=\{restartSignup\}/);
 const restart=app.slice(app.indexOf('async function restartSignup()'),app.indexOf('async function finishOnboarding'));
 assert.match(restart,/rpc\('restart_onboarding'\)/);
 assert.match(restart,/setOnboardingState\('needed'\)/);
 assert.doesNotMatch(restart,/signOut|deleteOwnAccount|dev-delete-account/);
 assert.match(migration,/delete from public\.member_onboarding where user_id=member_id/);
 assert.doesNotMatch(migration,/delete from (public\.)?(billing_memberships|auth\.users)/);
});
