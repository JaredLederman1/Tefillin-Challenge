import { supabase } from './supabase';
import { FINANCIAL_FEATURES_ENABLED } from './features';

export const paymentsLive = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_') === true;
export async function billingAction(action: string, body: Record<string, unknown> = {}) {
  if(!FINANCIAL_FEATURES_ENABLED&&['subscribe','donate','withdraw','onboard'].includes(action))throw new Error('Contributions and donations are currently unavailable.');
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
