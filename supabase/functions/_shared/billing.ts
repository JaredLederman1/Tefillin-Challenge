import { createClient } from 'npm:@supabase/supabase-js@2';
export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function key(mode:boolean) {
 const value=Deno.env.get(mode?'STRIPE_LIVE_SECRET_KEY':'STRIPE_SECRET_KEY');
 if(!value?.startsWith(mode?'sk_live_':'sk_test_')) throw new Error(mode?'Live Stripe credentials are not configured.':'Test Stripe credentials are not configured.');
 return value;
}
export async function stripe(mode:boolean,path:string,body?:Record<string,string>,idempotency?:string,method?:string) {
 const r=await fetch('https://api.stripe.com/v1/'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:`Bearer ${key(mode)}`,'Stripe-Version':'2025-06-30.basil',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},...(body?{body:new URLSearchParams(body)}:{})});
 const data=await r.json(); if(!r.ok) throw new Error(data.error?.message||'Stripe request failed'); return data;
}
export async function member(req:Request) {
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!token) throw new Error('Sign in required');
 const {data,error}=await db().auth.getUser(token); if(error||!data.user) throw new Error('Sign in required'); return data.user;
}
export function checked(result:any) { if(result.error) throw new Error(result.error.message);return result.data; }
export async function syncSubscription(mode:boolean,sub:any) {
 if(sub.livemode!==mode || sub.metadata?.purpose!=='levav_membership') throw new Error('Invalid subscription');
 checked(await db().from('billing_memberships').update({subscription_id:sub.id,customer_id:sub.customer,status:sub.status,cancel_at_period_end:sub.cancel_at_period_end}).eq('id',sub.metadata.membership_id).eq('livemode',mode));
}
