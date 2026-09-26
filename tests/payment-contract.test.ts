import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const paymentClient=readFileSync(new URL('../src/payments.ts',import.meta.url),'utf8');
const purchaseScreen=readFileSync(new URL('../src/ContributionSetup.tsx',import.meta.url),'utf8');
const config=readFileSync(new URL('../app.json',import.meta.url),'utf8');

test('iOS contribution uses StoreKit and has no Stripe checkout path',()=>{
 assert.match(paymentClient,/billingAction\('apple-purchase'/);
 assert.match(paymentClient,/signedTransactionInfo/);
 assert.match(purchaseScreen,/useIAP/);
 assert.match(purchaseScreen,/com\.jaredlederman\.tefillinchallenge\.monthly-contribution/);
 assert.match(purchaseScreen,/\$2\.19\/month through the App Store/);
 assert.doesNotMatch(config,/@stripe\/stripe-react-native/);
});
