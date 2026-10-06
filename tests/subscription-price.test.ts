import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionPriceLabel} from '../src/subscription-price.ts';

test('subscription disclosure keeps the exact store-localized price and complete duration',()=>{
 assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'€2,49',subscriptionPeriodNumberIOS:'1',subscriptionPeriodUnitIOS:'month'}),'€2,49 / month');
 assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'¥800',subscriptionPeriodNumberIOS:'3',subscriptionPeriodUnitIOS:'month'}),'¥800 / 3 months');
 assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'CHF 20.00',subscriptionPeriodNumberIOS:'1',subscriptionPeriodUnitIOS:'year'}),'CHF 20.00 / year');
});

test('missing or malformed StoreKit terms never produce a fabricated price or period',()=>{
 assert.equal(subscriptionPriceLabel(),null);
 for(const unit of [undefined,'empty','fortnight'])assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'$2.16',subscriptionPeriodNumberIOS:'1',subscriptionPeriodUnitIOS:unit}),null);
 for(const count of [undefined,'','0','-1','1.5','Infinity'])assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'$2.16',subscriptionPeriodNumberIOS:count,subscriptionPeriodUnitIOS:'month'}),null);
 assert.equal(subscriptionPriceLabel({platform:'ios',displayPrice:'',subscriptionPeriodNumberIOS:'1',subscriptionPeriodUnitIOS:'month'}),null);
 assert.equal(subscriptionPriceLabel({platform:'android',displayPrice:'$2.16',subscriptionPeriodNumberIOS:'1',subscriptionPeriodUnitIOS:'month'}),null);
});
