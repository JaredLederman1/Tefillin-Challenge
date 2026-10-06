import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return reply({error:'Sign in first.'},401);
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:'Sign in first.'},401);
 try{
  const body=await req.json();
  if(body.confirmation!=='DELETE')return reply({error:'Confirm account deletion.'},400);
  // This is a development reset: remove every app record owned by this member,
  // including payment history, before deleting the Auth user.
  // Use the Storage API to delete files as well as their metadata. Paths are server-derived.
  while(true){
   const {data,error}=await db.storage.from('checkins').list(user.id,{limit:100});
   if(error)throw error;
   if(!data?.length)break;
   const files=data.filter(file=>file.id).map(file=>`${user.id}/${file.name}`);
   if(files.length!==data.length)throw new Error('Unexpected photo folder. Account was not deleted.');
   const {error:removeError}=await db.storage.from('checkins').remove(files);
   if(removeError)throw removeError;
  }
  const {data:memberships,error:membershipError}=await db.from('billing_memberships').select('id,subscription_id,livemode').eq('user_id',user.id);
  if(membershipError)throw membershipError;
  const membershipIds=(memberships||[]).map(m=>m.id);
  // Stop renewal before erasing local billing references. A failed Stripe
  // cancellation leaves the account intact so it cannot be deleted while a
  // recurring charge might still be active.
  for(const membership of memberships||[]){
   if(!membership.subscription_id||!membership.subscription_id.startsWith('sub_'))continue;
   const key=Deno.env.get(membership.livemode?'STRIPE_LIVE_SECRET_KEY':'STRIPE_SECRET_KEY');
   if(!key)throw new Error('Could not cancel the recurring contribution. Please contact support.');
   const canceled=await fetch(`https://api.stripe.com/v1/subscriptions/${membership.subscription_id}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`}});
   // A subscription may already have been cancelled in Stripe (for example,
   // after a test checkout or a retry). It cannot renew in that state, so its
   // stale local reference must not prevent the member from deleting account.
   if(!canceled.ok&&canceled.status!==404)throw new Error('Could not cancel the recurring contribution. Please contact support.');
  }
  if(membershipIds.length){
   const {error:invoiceError}=await db.from('billing_invoices').delete().in('membership_id',membershipIds);
   if(invoiceError)throw invoiceError;
  }
  for(const table of ['donation_requests','withdrawals','ledger','enrollments','payout_accounts','billing_memberships']){
   const {error}=await db.from(table).delete().eq('user_id',user.id);
   if(error)throw error;
  }
  const {error}=await db.auth.admin.deleteUser(user.id);
  if(error)throw error;
  return reply({deleted:true,appStoreSubscriptionMayRemain:(memberships||[]).some(m=>m.subscription_id&&!m.subscription_id.startsWith('sub_'))});
 }catch(error){return reply({error:error instanceof Error?error.message:'Could not delete account. Please try again.'},400);}
});
