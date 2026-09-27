import {db,reply,cors,stripe,member,checked,syncSubscription} from '../_shared/billing.ts';
import {verifyApplePurchase} from '../_shared/apple.ts';

// Webhooks remain the primary path, but this closes the gap when a device has
// confirmed Apple Pay and Stripe has not yet delivered its invoice event.
async function reconcileLatestInvoice(mode:boolean,m:any,sub:any) {
 const latest=typeof sub.latest_invoice==='string'?sub.latest_invoice:sub.latest_invoice?.id;
 if(!latest||sub.status!=='active')return;
 const invoice=await stripe(mode,`invoices/${latest}?expand[]=payment_intent&expand[]=payments.data.payment.payment_intent`);
 if(invoice.status!=='paid'||invoice.currency!=='usd'||invoice.amount_paid!==m.amount_cents)return;
 // Stripe's invoice API returns either the legacy payment_intent field or the
 // newer invoice-payments collection, depending on the invoice/API version.
 let payment=invoice.payment_intent||invoice.payments?.data?.find((p:any)=>p.status==='paid'&&p.payment?.type==='payment_intent')?.payment?.payment_intent;
 if(typeof payment==='string')payment=await stripe(mode,`payment_intents/${payment}`);
 if(!payment||payment.status!=='succeeded'||payment.amount_received!==invoice.amount_paid||payment.customer!==sub.customer)return;
 const charge=await stripe(mode,`charges/${payment.latest_charge}?expand[]=balance_transaction`);
 const balanceTransaction=charge.balance_transaction;
 if(!balanceTransaction||typeof balanceTransaction==='string'||!Number.isFinite(balanceTransaction.available_on))return;
 await syncSubscription(mode,sub);
 checked(await db().rpc('record_paid_invoice',{
   event_id:`status-reconcile:${invoice.id}`,mode,membership:m.id,invoice_id:invoice.id,intent_id:payment.id,charge:charge.id,
   gross:invoice.amount_paid,fee:balanceTransaction.fee,paid:new Date((invoice.status_transitions?.paid_at||invoice.created)*1000).toISOString(),
   available:new Date(balanceTransaction.available_on*1000).toISOString(),issued:new Date(invoice.created*1000).toISOString()
 }));
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const user=await member(req);const body=await req.json();const mode=body.livemode===true;
  if(body.action==='withdraw'||body.action==='onboard') return reply({error:'Payouts have been retired. Use donations instead.'},410);
  if(body.action==='apple-purchase') {
   const transaction=await verifyApplePurchase(body,user.id);
   const membership=checked(await db().rpc('reserve_membership',{member:user.id,mode:true,cents:180,covers_fee:false}));
   if(membership.subscription_id&&membership.subscription_id!==transaction.originalTransactionId) return reply({error:'Another App Store subscription is already active.'},409);
   checked(await db().from('billing_memberships').update({subscription_id:transaction.originalTransactionId,status:'active',cancel_at_period_end:false}).eq('id',membership.id).eq('livemode',true));
   const paidAt=new Date(transaction.purchaseDate).toISOString();
   checked(await db().rpc('record_paid_invoice',{event_id:`apple:${transaction.transactionId}`,mode:true,membership:membership.id,invoice_id:`apple:${transaction.transactionId}`,intent_id:`apple:${transaction.transactionId}`,charge:`apple:${transaction.transactionId}`,gross:180,fee:0,paid:paidAt,available:paidAt,issued:paidAt}));
   return reply({verified:true,transactionId:transaction.transactionId,environment:transaction.environment});
  }
  if(body.action==='donate') {
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if(!uuid.test(body.requestId||'')||!uuid.test(body.causeId||'')||!Number.isSafeInteger(body.amountCents)||body.amountCents<=0) return reply({error:'Invalid donation request'},400);
   const donation=checked(await db().rpc('request_donation',{member:user.id,mode,cause:body.causeId,request_id:body.requestId,expected_cents:body.amountCents}));
   return reply({donation});
  }
  if(body.action==='status') {
   let walletSyncPending=false;
   let m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false}).limit(1))[0];
   if(m?.subscription_id?.startsWith('sub_')){
    const sub=await stripe(mode,`subscriptions/${m.subscription_id}`);
    await syncSubscription(mode,sub);
    try{await reconcileLatestInvoice(mode,m,sub);}catch(error){walletSyncPending=true;console.error('Invoice reconciliation pending',error.message);}
    m=checked(await db().from('billing_memberships').select('*').eq('id',m.id).single());
   }
   const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date());
   const preference=checked(await db().from('member_charity_preferences').select('cause_id').eq('user_id',user.id).eq('livemode',mode).maybeSingle());
   return reply({walletSyncPending,preferredCauseId:preference?.cause_id||null,donations:checked(await db().from('donation_requests').select('id,cause_name,amount_cents,status,created_at,resolved_at,fulfillment_reference').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false})),membership:m||null,enrollments:checked(await db().from('enrollments').select('month,contribution_cents,settled_at').eq('user_id',user.id).eq('livemode',mode)),recipients:checked(await db().from('donation_causes').select('id,name,description,website_url,featured_month').eq('enabled',true).eq('livemode',mode)).filter((c:any)=>!c.featured_month||c.featured_month.slice(0,7)===month)});
  }
  if(body.action==='cancel-pending') {
   const m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).in('status',['creating','incomplete']).maybeSingle());
   if(!m) return reply({canceled:false});
   if(m.subscription_id) {
    const sub=await stripe(mode,`subscriptions/${m.subscription_id}`,undefined,`ratzon-cancel-pending-${m.id}`,'DELETE');
    await syncSubscription(mode,sub);
   } else checked(await db().from('billing_memberships').update({status:'canceled'}).eq('id',m.id).eq('livemode',mode));
   return reply({canceled:true});
  }
  if(body.action==='subscribe') {
   if(!Deno.env.get(mode?'STRIPE_LIVE_WEBHOOK_SECRET':'STRIPE_WEBHOOK_SECRET')) return reply({error:'Payments are not ready yet. Payment confirmation setup is still required.'},503);
   const cents=body.amountCents, coversStripeFee=body.coversStripeFee===true;
   if(!Number.isSafeInteger(cents)||cents<180||cents>1800||body.recurringConsent!==true) return reply({error:'Choose $1.80–$18 and accept monthly billing.'},400);
   const m=checked(await db().rpc('reserve_membership',{member:user.id,mode,cents,covers_fee:coversStripeFee}));
   if(!m.subscription_id && Date.now()-Date.parse(m.created_at)>23*60*60*1000) throw new Error('Previous checkout needs reconciliation before retrying.');
   const customer=m.customer_id|| (await stripe(mode,'customers',{'metadata[levav_user]':user.id},`levav-customer-${m.id}`)).id;
   checked(await db().from('billing_memberships').update({customer_id:customer}).eq('id',m.id));
   const product=await stripe(mode,'products',{name:'Ratzon monthly contribution'},'ratzon-membership-product-v1');
   let sub=m.subscription_id?await stripe(mode,`subscriptions/${m.subscription_id}?expand[]=latest_invoice.confirmation_secret`):await stripe(mode,'subscriptions',{
    customer,'items[0][price_data][currency]':'usd','items[0][price_data][product]':product.id,'items[0][price_data][unit_amount]':String(m.amount_cents),'items[0][price_data][recurring][interval]':'month',
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
