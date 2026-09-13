import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Sandbox checkout only. It deliberately cannot create enrollments or wallet credits.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in to test payments.' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user) return reply({ error: 'Sign in to test payments.' }, 401);
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret?.startsWith('sk_test_')) return reply({ error: 'Stripe test payments are not configured.' }, 503);
  try {
    const body = await req.json();
    if (body.action === 'create') {
      if (!Number.isSafeInteger(body.amountCents) || body.amountCents < 500 || body.amountCents > 100000) return reply({ error: 'Choose $5 to $1,000.' }, 400);
      if (typeof body.attemptId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.attemptId)) return reply({ error: 'Invalid payment attempt.' }, 400);
      const params = new URLSearchParams({ amount: String(body.amountCents), currency: 'usd', 'payment_method_types[]': 'card', 'metadata[user_id]': user.id, 'metadata[purpose]': 'tefillin_test_checkout', description: 'Ratzon — test checkout only' });
      const response = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `tefillin-test-${user.id}-${body.attemptId}` }, body: params });
      const intent = await response.json();
      if (!response.ok || intent.livemode !== false) return reply({ error: 'Unable to start test payment. Try again.' }, 502);
      return reply({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    }
    if (body.action === 'verify') {
      if (typeof body.paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9]+$/.test(body.paymentIntentId)) return reply({ error: 'Invalid payment.' }, 400);
      const response = await fetch(`https://api.stripe.com/v1/payment_intents/${body.paymentIntentId}`, { headers: { Authorization: `Bearer ${secret}` } });
      const intent = await response.json();
      if (!response.ok || intent.livemode !== false || intent.metadata?.user_id !== user.id || intent.metadata?.purpose !== 'tefillin_test_checkout') return reply({ error: 'Payment not found.' }, 404);
      return reply({ status: intent.status, amountCents: intent.amount, testMode: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch {
    return reply({ error: 'Unable to process test payment.' }, 400);
  }
});
