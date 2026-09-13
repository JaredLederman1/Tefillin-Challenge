import { Platform, TurboModuleRegistry, Linking } from 'react-native';
import { supabase } from './supabase';

export const paymentsLive = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_') === true;
export async function billingAction(action: string, body: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Sign in required.');
  const result = await supabase.functions.invoke('ratzon-billing', { body: { action, ...body, livemode: paymentsLive } });
  if (result.error) {
    const response = (result.error as any).context;
    let message = 'Payment service unavailable. Please try again.';
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  if (result.data?.error) throw new Error(result.data.error);
  return result.data;
}
export async function subscribeContribution(amountCents: number) {
  if (Platform.OS === 'web') throw new Error('Open the native app to test card payments.');
  if (!TurboModuleRegistry.get('StripeSdk')) throw new Error('This build needs the Stripe module. Rebuild and install the development app, then try again.');
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) throw new Error('Stripe test payments are not configured.');
  if (!supabase) throw new Error('Sign in to test payments.');
  // Load only after checking native availability so older development builds still open.
  const stripe = await import('@stripe/stripe-react-native');
  await stripe.initStripe({ publishableKey, urlScheme: 'tefillinchallenge' });
  const data = await billingAction('subscribe', { amountCents, recurringConsent: true });
  const initialized = await stripe.initPaymentSheet({ merchantDisplayName: 'Ratzon', paymentIntentClientSecret: data.clientSecret, returnURL: 'tefillinchallenge://stripe-redirect', style: 'alwaysDark', primaryButtonLabel: paymentsLive ? 'Subscribe' : 'Subscribe (test mode)', appearance: { colors: { primary: '#2478FF', background: '#000000', componentBackground: '#101114', componentText: '#FFFFFF', primaryText: '#FFFFFF' } } });
  if (initialized.error) throw new Error(initialized.error.message);
  const redirect = Linking.addEventListener('url', ({ url }) => { stripe.handleURLCallback(url).catch(() => {}); });
  let presented;
  try { presented = await stripe.presentPaymentSheet(); } finally { redirect.remove(); }
  if (presented.error?.code === 'Canceled') return false;
  if (presented.error) throw new Error(presented.error.message);
  // Enrollment is created only by the signed Stripe webhook, never by this screen.
  return true;
}
