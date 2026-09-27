import {Platform} from 'react-native';
import type {Purchase,PurchaseIOS} from 'expo-iap';
import {billingAction} from './billing-client';

export {billingAction} from './billing-client';
// App Store purchases are always production/TestFlight StoreKit transactions.
export const paymentsLive=true;

export async function confirmAppleContribution(purchase:Purchase) {
 if(Platform.OS!=='ios')throw new Error('Open the iPhone app to subscribe.');
 const apple=purchase as PurchaseIOS;
 if(!apple.transactionId||!apple.purchaseToken)throw new Error('The App Store did not provide a transaction to verify.');
 const result=await billingAction('apple-purchase',{
  productId:apple.productId,
  transactionId:apple.transactionId,
  originalTransactionId:apple.originalTransactionIdentifierIOS||apple.transactionId,
  signedTransactionInfo:apple.purchaseToken,
  environment:apple.environmentIOS||null
 });
 if(result?.verified!==true)throw new Error('The payment service did not confirm this purchase. Please retry confirmation.');
}

/** @deprecated Stripe checkout has been removed. */
export async function subscribeContribution():Promise<boolean>{throw new Error('This version uses App Store purchases.');}
