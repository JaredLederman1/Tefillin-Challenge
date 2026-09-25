import { Platform, TurboModuleRegistry, Linking } from 'react-native';
import { supabase } from './supabase';
import { FINANCIAL_FEATURES_ENABLED } from './features';
import appConfig from '../app.json';

const stripePlugin = appConfig.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === '@stripe/stripe-react-native');
const merchantIdentifier = (stripePlugin?.[1] as { merchantIdentifier: string }).merchantIdentifier;

import { billingAction, paymentsLive } from './billing-client';
export { billingAction, paymentsLive } from './billing-client';

let paymentPreparation: Promise<void> | null = null;
/** Warm native Stripe and Apple Pay while the contribution screen is visible. */
export function prepareContributionPayment() {
  if(!FINANCIAL_FEATURES_ENABLED)return Promise.resolve();
  if (Platform.OS === 'web' || paymentPreparation) return paymentPreparation || Promise.resolve();
  paymentPreparation = (async () => {
    if (!TurboModuleRegistry.get('StripeSdk')) return;
    const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) return;
    const stripe = require('@stripe/stripe-react-native') as typeof import('@stripe/stripe-react-native');
    await stripe.initStripe({ publishableKey, merchantIdentifier, urlScheme: 'tefillinchallenge' });
    if (Platform.OS === 'ios') await stripe.isPlatformPaySupported();
  })().catch(error => { paymentPreparation = null; throw error; });
  return paymentPreparation;
}

export async function subscribeContribution(amountCents: number, coversStripeFee=false) {
  if(!FINANCIAL_FEATURES_ENABLED)throw new Error('Contributions are currently unavailable.');
  if (Platform.OS === 'web') throw new Error('Open the native app to test card payments.');
  if (!TurboModuleRegistry.get('StripeSdk')) throw new Error('This build needs the Stripe module. Rebuild and install the development app, then try again.');
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) throw new Error('Stripe test payments are not configured.');
  if (!supabase) throw new Error('Sign in to test payments.');
  // Load only after checking native availability so older development builds still open.
  const stripe = require('@stripe/stripe-react-native') as typeof import('@stripe/stripe-react-native');
  await prepareContributionPayment();
  const data = await billingAction('subscribe', { amountCents, coversStripeFee, recurringConsent: true });
  const initialized = await stripe.initPaymentSheet({ merchantDisplayName: 'Ratzon', paymentIntentClientSecret: data.clientSecret, returnURL: 'tefillinchallenge://stripe-redirect', style: 'alwaysLight', primaryButtonLabel: paymentsLive ? 'Subscribe' : 'Subscribe (test mode)', ...(Platform.OS==='ios'?{applePay:{merchantCountryCode:'US'}}:{}), appearance: { colors: { primary: '#2478FF', background: '#EDF4FF', componentBackground: '#FFFFFF', componentText: '#062B60', primaryText: '#062B60' } } });
  if (initialized.error) throw new Error(initialized.error.message);
  const redirect = Linking.addEventListener('url', ({ url }) => { stripe.handleURLCallback(url).catch(() => {}); });
  let presented;
  try { presented = await stripe.presentPaymentSheet(); } finally { redirect.remove(); }
  if (presented.error?.code === 'Canceled') {
    void billingAction('cancel-pending').catch(() => {});
    return false;
  }
  if (presented.error) throw new Error(presented.error.message);
  // Enrollment is created only by the signed Stripe webhook, never by this screen.
  return true;
}
