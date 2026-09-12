import {db,reply,cors,key,stripe,member,checked,syncSubscription} from '../_shared/billing.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const user=await member(req);const body=await req.json();const mode=body.livemode===true; key(mode);
  if(body.action==='status') {
   let m=checked(await db().from('billing_memberships').select('*').eq('user_id',user.id).eq('livemode',mode).order('created_at',{ascending:false}).limit(1))[0];
   if(m?.subscription_id){await syncSubscription(mode,await stripe(mode,`subscriptions/${m.subscription_id}`));m=checked(await db().from('billing_memberships').select('*').eq('id',m.id).single());}
   return reply({membership:m||null,enrollments:checked(await db().from('enrollments').select('month,contribution_cents,settled_at').eq('user_id',user.id).eq('livemode',mode)),recipients:checked(await db().from('donation_recipients').select('id,name').eq('enabled',true).eq('livemode',mode))});
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
  if(body.action==='onboard') {
   let a=checked(await db().from('payout_accounts').select('*').eq('user_id',user.id).eq('livemode',mode).maybeSingle());
   if(!a){const account=await stripe(mode,'accounts',{type:'express',country:'US','capabilities[transfers][requested]':'true','metadata[levav_user]':user.id},`levav-recipient-${mode}-${user.id}`);a={user_id:user.id,livemode:mode,account_id:account.id};checked(await db().from('payout_accounts').upsert(a));}
   const site='https://jaredlederman1.github.io/Tefillin-Challenge/';
   const link=await stripe(mode,'account_links',{account:a.account_id,type:'account_onboarding',return_url:site,refresh_url:site});return reply({url:link.url});
  }
  if(body.action==='withdraw') {
   if(!Number.isSafeInteger(body.amountCents)||body.amountCents<=0||typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId)) throw new Error('Invalid withdrawal');
   const a=body.recipientId?checked(await db().from('donation_recipients').select('account_id').eq('id',body.recipientId).eq('livemode',mode).eq('enabled',true).single()):checked(await db().from('payout_accounts').select('account_id').eq('user_id',user.id).eq('livemode',mode).single());
   const account=await stripe(mode,`accounts/${a.account_id}`);
   if(!account.payouts_enabled||account.capabilities?.transfers!=='active') throw new Error('Complete payout account setup first.');
   const r=checked(await db().rpc('reserve_withdrawal',{member:user.id,mode,cents:body.amountCents,destination_id:a.account_id,request_id:body.requestId}));
   if(r.status==='review') throw new Error('Your previous withdrawal needs review.');
   if(r.status==='transferred') return reply({status:'transferred'});
   // Stripe idempotency keys expire: unresolved old requests must be reconciled manually.
   if(Date.now()-Date.parse(r.created_at)>23*60*60*1000){checked(await db().from('withdrawals').update({status:'review'}).eq('id',r.id));throw new Error('Withdrawal awaiting reconciliation.');}
   const transfer=await stripe(mode,'transfers',{amount:String(r.amount_cents),currency:'usd',destination:r.destination,'metadata[withdrawal_id]':r.id},`levav-withdrawal-${r.id}`);
   checked(await db().from('withdrawals').update({status:'transferred',transfer_id:transfer.id}).eq('id',r.id));
   return reply({status:'transferred'});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e.message},e.message==='Sign in required'?401:400);}
});
