import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const billing=readFileSync(new URL('../supabase/functions/ratzon-billing/index.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/payments.ts',import.meta.url),'utf8');
const reservation=readFileSync(new URL('../supabase/migrations/202609150007_repair_membership_contribution_reservation.sql',import.meta.url),'utf8');

test('checkout contract persists both the selected contribution and Stripe charge',()=>{
 assert.match(client,/billingAction\('subscribe', \{ amountCents, coversStripeFee, recurringConsent: true \}\)/);
 assert.match(billing,/reserve_membership',\{member:user\.id,mode,cents,covers_fee:coversStripeFee\}/);
 assert.match(reservation,/contribution_cents,/);
 assert.match(reservation,/covers_stripe_fee/);
 assert.match(reservation,/values \(\s*member,\s*mode,\s*charged,\s*cents,\s*covers_fee/s);
});
