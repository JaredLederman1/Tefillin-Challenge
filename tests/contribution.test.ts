import test from 'node:test';
import assert from 'node:assert/strict';
import {sliderCents,chargeWithStripeFeeCovered,stripeFeeCents} from '../src/contribution.ts';

test('contribution slider starts at $1.80, then uses whole-dollar increments',()=>{
 assert.equal(sliderCents(0,100),180);
 assert.equal(sliderCents(5.8,100),200);
 assert.equal(sliderCents(11.8,100),300);
 assert.equal(sliderCents(100,100),1800);
 assert.equal(sliderCents(-20,100),180);
 assert.equal(sliderCents(120,100),1800);
});

test('fee-cover charge preserves the selected contribution after Stripe fees',()=>{
 const charge=chargeWithStripeFeeCovered(180);
 assert.equal(charge,217);
 assert.ok(charge-stripeFeeCents(charge)>=180);
 assert.equal(stripeFeeCents(180),36);
});
