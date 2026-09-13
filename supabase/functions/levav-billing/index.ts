import {db,reply,cors,stripe,member,checked,syncSubscription} from '../_shared/billing.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const user=await member(req);const body=await req.json();const mode=body.livemode===true;
  if(body.action==='withdraw'||body.action==='onboard') return reply({error:'Payouts have been retired. Use donations instead.'},410);
  if(body.action==='donate') {
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if(!uuid.test(body.requestId||'')||!uuid.test(body.causeId||'')||!Number.isSafeInteger(body.amountCents)||body.amountCents<=0) return reply({error:'Invalid donation request'},400);
   const donation=checked(await db().rpc('request_donation',{member:user.id,mode,cause:body.causeId,request_id:body.requestId,expected_cents:body.amountCents}));
   return reply({donation});
  }
  if(body.action==='status') {
   let m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false}).limit(1))[0];
   if(m?.subscription_id){await syncSubscription(mode,await stripe(mode,`subscriptions/${m.subscription_id}`));m=checked(await db().from('billing_memberships').select('*').eq('id',m.id).single());}
   const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date());
   return reply({donations:checked(await db().from('donation_requests').select('id,cause_name,amount_cents,status,created_at,resolved_at,fulfillment_reference').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false})),membership:m||null,enrollments:checked(await db().from('enrollments').select('month,contribution_cents,settled_at').eq('user_id',user.id).eq('livemode',mode)),recipients:checked(await db().from('donation_causes').select('id,name,featured_month').eq('enabled',true).eq('livemode',mode)).filter((c:any)=>!c.featured_month||c.featured_month.slice(0,7)===month)});
  }
  if(body.action==='subscribe') {
   if(!Deno.env.get(mode?'STRIPE_LIVE_WEBHOOK_SECRET':'STRIPE_WEBHOOK_SECRET')) return reply({error:'Payments are not ready yet. Payment confirmation setup is still required.'},503);
   const cents=body.amountCents;
   if(!Number.isSafeInteger(cents)||cents<500||cents>100000||body.recurringConsent!==true) return reply({error:'Choose $5–$1,000 and accept monthly billing.'},400);
   const m=checked(await db().rpc('reserve_membership',{member:user.id,mode,cents}));
   if(!m.subscription_id && Date.now()-Date.parse(m.created_at)>23*60*60*1000) throw new Error('Previous checkout needs reconciliation before retrying.');
   const customer=m.customer_id|| (await stripe(mode,'customers',{'metadata[levav_user]':user.id},`levav-customer-${m.id}`)).id;
   checked(await db().from('billing_memberships').update({customer_id:customer}).eq('id',m.id));
   const product=await stripe(mode,'products',{name:'Levav monthly contribution'},'levav-membership-product-v1');
   let sub=m.subscription_id?await stripe(mode,`subscriptions/${m.subscription_id}?expand[]=latest_invoice.confirmation_secret`):await stripe(mode,'subscriptions',{
    customer,'items[0][price_data][currency]':'usd','items[0][price_data][product]':product.id,'items[0][price_data][unit_amount]':String(cents),'items[0][price_data][recurring][interval]':'month',
    payment_behavior:'default_incomplete','payment_settings[save_default_payment_method]':'on_subscription','payment_settings[payment_method_types][]':'card',
    'metadata[purpose]':'levav_membership','metadata[membership_id]':m.id,'expand[]':'latest_invoice.confirmation_secret'
   },`levav-subscription-${m.id}`);
   await syncSubscription(mode,sub);
   if(sub.status!=='incomplete') return reply({error:'You already have a membership. Check its status or cancel renewal.'},409);
   const secret=sub.latest_invoice?.confirmation_secret?.client_secret;
   if(!secret) throw new Error('Payment initialization is pending. Please retry.');
   return reply({clientSecret:secret,subscriptionId:sub.id,livemode:mode});
  }
  if(body.action==='cancel') {
   const m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).not('status','in','(canceled,incomplete_expired)').single());
   if(!m.subscription_id) throw new Error('Membership is still being created.');
   const sub=await stripe(mode,`subscriptions/${m.subscription_id}`,{cancel_at_period_end:'true'},`levav-cancel-${m.id}`);await syncSubscription(mode,sub);return reply({canceledAtPeriodEnd:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e.message},e.message==='Sign in required'?401:400);}
});
