import {db,reply,cors,stripe,member,checked,syncSubscription} from '../_shared/billing.ts';
import {verifyApplePurchase,verifyDeviceTransaction,setAppleAppAccountToken,getAppleTransaction,getAppleSubscriptionTransaction} from '../_shared/apple.ts';

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
  if(['withdraw','onboard','donate','subscribe'].includes(body.action)) return reply({error:'Personal contribution pools and donation balances have been retired. Subscribe through the App Store for digital access.'},410);
  if(body.action==='apple-purchase') {
   let transaction;
   try{transaction=await verifyApplePurchase(body,user.id);}
   catch(error){
    if(!(error instanceof Error)||!error.message.includes('linked to a different Ratzon account'))throw error;
    // A deleted app account can leave an active StoreKit subscription behind.
    // Only a signed transaction supplied by StoreKit on this device may claim it.
    const current=await getAppleTransaction(body.transactionId,body.environment);
    const device=await verifyDeviceTransaction(body.signedTransactionInfo,current.environment);
    if(device.transactionId!==body.transactionId||device.originalTransactionId!==body.originalTransactionId)throw new Error('App Store transaction validation failed.');
    if(current.transactionId!==device.transactionId||current.originalTransactionId!==device.originalTransactionId||current.appAccountToken===user.id||current.revocationDate||!current.expiresDate||current.expiresDate<Date.now())throw new Error('App Store transaction validation failed.');
    const priorAccount=current.appAccountToken;
    if(!priorAccount)throw new Error('This subscription needs support to restore.');
    const oldUser=await db().auth.admin.getUserById(priorAccount);
    if(oldUser.data?.user)throw new Error('This Apple subscription is linked to another active Ratzon account. Sign in to that account.');
    if(oldUser.error&&!/not found/i.test(oldUser.error.message))throw oldUser.error;
    const claimed=checked(await db().from('billing_memberships').select('user_id').eq('subscription_id',current.originalTransactionId).maybeSingle());
    if(claimed&&claimed.user_id!==user.id)throw new Error('This subscription is already claimed by another Ratzon account. Contact support.');
    await setAppleAppAccountToken(current.originalTransactionId,user.id,current.environment);
    transaction=await verifyApplePurchase(body,user.id);
   }
   checked(await db().rpc('record_app_subscription',{
    member:user.id,original_id:transaction.originalTransactionId,transaction_id:transaction.transactionId,
    environment:transaction.environment,purchased:new Date(transaction.purchaseDate).toISOString(),expires:new Date(transaction.expiresDate!).toISOString(),
   }));
   return reply({verified:true,transactionId:transaction.transactionId,environment:transaction.environment});
  }
  if(body.action==='status') {
   let walletSyncPending=false;
   let m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false}).limit(1))[0];
   if(m?.subscription_id?.startsWith('sub_')){
    const sub=await stripe(mode,`subscriptions/${m.subscription_id}`);
    await syncSubscription(mode,sub);
    try{await reconcileLatestInvoice(mode,m,sub);}catch(error){walletSyncPending=true;console.error('Invoice reconciliation pending',error instanceof Error?error.message:String(error));}
    m=checked(await db().from('billing_memberships').select('*').eq('id',m.id).single());
   }
   if(m?.subscription_id && !m.subscription_id.startsWith('sub_')) {
    const transaction=await getAppleSubscriptionTransaction(m.subscription_id);
    const valid=transaction.appAccountToken?.toLowerCase()===user.id.toLowerCase() && !transaction.revocationDate && !!transaction.expiresDate && transaction.expiresDate>Date.now();
    checked(await db().from('billing_memberships').update({status:valid?'active':'canceled',access_expires_at:new Date(transaction.expiresDate||0).toISOString()}).eq('id',m.id).eq('user_id',user.id));
    m=checked(await db().from('billing_memberships').select('*').eq('id',m.id).single());
   }
   return reply({membership:m||null});
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
  if(body.action==='cancel') {
   const m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).not('status','in','(canceled,incomplete_expired)').single());
   if(!m.subscription_id) throw new Error('Membership is still being created.');
   if(!m.subscription_id.startsWith('sub_')) return reply({error:'Manage your subscription in App Store subscription settings.'},400);
   const sub=await stripe(mode,`subscriptions/${m.subscription_id}`,{cancel_at_period_end:'true'},`levav-cancel-${m.id}`);await syncSubscription(mode,sub);return reply({canceledAtPeriodEnd:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){const message=e instanceof Error?e.message:String(e);return reply({error:message},message==='Sign in required'?401:400);}
});
