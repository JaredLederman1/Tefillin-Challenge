import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const paymentClient=readFileSync(new URL('../src/payments.ts',import.meta.url),'utf8');
const purchaseScreen=readFileSync(new URL('../src/ContributionSetup.tsx',import.meta.url),'utf8');
const config=readFileSync(new URL('../app.json',import.meta.url),'utf8');
const billing=readFileSync(new URL('../supabase/functions/ratzon-billing/index.ts',import.meta.url),'utf8');
const appleVerifier=readFileSync(new URL('../supabase/functions/_shared/apple.ts',import.meta.url),'utf8');

test('iOS digital subscription uses StoreKit and has no Stripe checkout path',()=>{
 assert.match(paymentClient,/billingAction\('apple-purchase'/);
 assert.match(paymentClient,/signedTransactionInfo/);
 assert.match(purchaseScreen,/useIAP/);
 assert.match(purchaseScreen,/com\.jaredlederman\.tefillinchallenge\.monthly_contribution/);
 assert.match(purchaseScreen,/appAccountToken/);
 assert.match(purchaseScreen,/subscriptionPriceLabel\(product\)/);
 // A clearly labeled charity target is distinct from the StoreKit price.
 assert.doesNotMatch(purchaseScreen.replace(/\$1\.80/g,''),/\$[12]\.(16|19|29)/);
 assert.match(billing,/body\.action==='apple-purchase'/);
 assert.match(appleVerifier,/api\.storekit\.itunes\.apple\.com/);
 assert.match(appleVerifier,/transaction\.appAccountToken\?\.toLowerCase\(\)!==expectedAccountToken\.toLowerCase\(\)/);
 assert.doesNotMatch(config,/@stripe\/stripe-react-native/);
});

test('an existing Apple subscription restores only through the Restore button',()=>{
 const screen=readFileSync(new URL('../src/ContributionSetup.tsx',import.meta.url),'utf8');
 const billing=readFileSync(new URL('../supabase/functions/ratzon-billing/index.ts',import.meta.url),'utf8');
 assert.match(screen,/currentEntitlementIOS\(MONTHLY_CONTRIBUTION_PRODUCT_ID\)/);
 assert.match(screen,/onLoadingStart\(\);setBusy\(true\)/);
 assert.match(screen,/withPurchaseTimeout\(currentEntitlementIOS/);
 assert.match(screen,/accessibilityLabel="Restore active Apple subscription"/);
 assert.doesNotMatch(screen,/restoreExisting\(true\)|restoreChecked/);
 assert.match(screen,/onPress=\{\(\)=>\{void restoreExisting\(\);\}\}/);
 assert.match(billing,/verifyDeviceTransaction\(body\.signedTransactionInfo,current\.environment\)/);
 assert.match(billing,/auth\.admin\.getUserById\(priorAccount\)/);
 assert.match(billing,/setAppleAppAccountToken\(current\.originalTransactionId,user\.id,current\.environment\)/);
});
