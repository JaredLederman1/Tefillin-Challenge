import { supabase } from './supabase';

export const paymentsLive = true;
export async function billingAction(action: string, body: Record<string, unknown> = {}) {
  if(['subscribe','donate','withdraw','onboard'].includes(action))throw new Error('Personal contribution pools and donation balances have been retired.');
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
