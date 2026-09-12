import { Platform, TurboModuleRegistry, Linking } from 'react-native';
import { supabase } from './supabase';

export async function testContribution(amountCents: number) {
  if (Platform.OS === 'web') throw new Error('Open the native app to test card payments.');
  if (!TurboModuleRegistry.get('StripeSdk')) throw new Error('This build needs the Stripe module. Rebuild and install the development app, then try again.');
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey?.startsWith('pk_test_')) throw new Error('Stripe test payments are not configured.');
  if (!supabase) throw new Error('Sign in to test payments.');
  // Load only after checking native availability so older development builds still open.
  const stripe = await import('@stripe/stripe-react-native');
  await stripe.initStripe({ publishableKey, urlScheme: 'tefillinchallenge' });
  const { data, error } = await supabase.functions.invoke('stripe-test-payment', { body: { action: 'create', amountCents, attemptId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` } });
  if (error || data?.error) throw new Error(data?.error || 'Could not connect to test checkout. Please try again.');
  const initialized = await stripe.initPaymentSheet({ merchantDisplayName: 'Levav', paymentIntentClientSecret: data.clientSecret, returnURL: 'tefillinchallenge://stripe-redirect', style: 'alwaysDark', primaryButtonLabel: 'Pay (test mode)', appearance: { colors: { primary: '#2478FF', background: '#000000', componentBackground: '#101114', componentText: '#FFFFFF', primaryText: '#FFFFFF' } } });
  if (initialized.error) throw new Error(initialized.error.message);
  const redirect = Linking.addEventListener('url', ({ url }) => { stripe.handleURLCallback(url).catch(() => {}); });
  let presented;
  try { presented = await stripe.presentPaymentSheet(); } finally { redirect.remove(); }
  if (presented.error?.code === 'Canceled') return false;
  if (presented.error) throw new Error(presented.error.message);
  const verified = await supabase.functions.invoke('stripe-test-payment', { body: { action: 'verify', paymentIntentId: data.paymentIntentId } });
  if (verified.error || verified.data?.status !== 'succeeded' || verified.data?.testMode !== true || verified.data?.amountCents !== amountCents) throw new Error('Test payment is awaiting confirmation. Check Stripe before retrying.');
  return true;
}
