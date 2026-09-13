import {db,reply,stripe,checked,syncSubscription} from '../_shared/billing.ts';
async function signature(raw:string,header:string,secret:string) {
 const parts=header.split(',').map(p=>p.split('='));const stamp=parts.find(p=>p[0]==='t')?.[1];
 if(!stamp||Math.abs(Date.now()/1000-Number(stamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${stamp}.${raw}`));
 const hex=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 return parts.filter(p=>p[0]==='v1').some(([,s])=>{if(s.length!==hex.length)return false;let diff=0;for(let i=0;i<s.length;i++)diff|=s.charCodeAt(i)^hex.charCodeAt(i);return diff===0;});
}
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const raw=await req.text();const sig=req.headers.get('stripe-signature')||'';
 let mode:boolean|undefined;
 for(const live of [false,true]) {const secret=Deno.env.get(live?'STRIPE_LIVE_WEBHOOK_SECRET':'STRIPE_WEBHOOK_SECRET');if(secret&&await signature(raw,sig,secret)){mode=live;break;}}
 if(mode===undefined)return reply({error:'Invalid signature'},400);
 try {
  const event=JSON.parse(raw);if(event.livemode!==mode)return reply({error:'Mode mismatch'},400);
  if(checked(await db().from('billing_events').select('id').eq('id',event.id).maybeSingle()))return reply({received:true});
  const obj=event.data.object;
  if(event.type.startsWith('customer.subscription.')) {
   if(obj.metadata?.purpose==='levav_membership')await syncSubscription(mode,await stripe(mode,`subscriptions/${obj.id}`));
  }else if(event.type==='invoice.payment_succeeded') {
   const invoice=await stripe(mode,`invoices/${obj.id}?expand[]=payments.data.payment.payment_intent`);
   const sid=invoice.parent?.subscription_details?.subscription;
   if(!sid)return reply({received:true});
   const sub=await stripe(mode,`subscriptions/${sid}`);
   if(sub.metadata?.purpose!=='levav_membership')return reply({received:true});
   const m=checked(await db().from('billing_memberships').select('*').eq('id',sub.metadata.membership_id).eq('livemode',mode).single());
   if(invoice.livemode!==mode||invoice.currency!=='usd'||invoice.status!=='paid'||invoice.amount_paid!==m.amount_cents||invoice.customer!==sub.customer)throw new Error('Invoice mismatch');
   let payment=invoice.payments?.data?.find((p:any)=>p.status==='paid'&&p.payment?.type==='payment_intent')?.payment?.payment_intent;
   if(typeof payment==='string')payment=await stripe(mode,`payment_intents/${payment}`);
   if(!payment||payment.status!=='succeeded'||payment.amount_received!==invoice.amount_paid||payment.customer!==sub.customer||payment.livemode!==mode)throw new Error('Payment pending verification');
   const charge=await stripe(mode,`charges/${payment.latest_charge}?expand[]=balance_transaction`);
   if(!charge.balance_transaction||typeof charge.balance_transaction==='string')throw new Error('Fees not available yet');
   const bt=charge.balance_transaction;
   if(bt.currency!=='usd'||bt.amount!==m.amount_cents)throw new Error('Settlement currency mismatch');
   await syncSubscription(mode,sub);
   checked(await db().rpc('record_paid_invoice',{event_id:event.id,mode,membership:m.id,invoice_id:invoice.id,intent_id:payment.id,charge:charge.id,gross:invoice.amount_paid,fee:bt.fee,paid:new Date(invoice.status_transitions.paid_at*1000).toISOString(),available:new Date(bt.available_on*1000).toISOString(),issued:new Date(invoice.created*1000).toISOString()}));
   if(charge.refunded||charge.disputed||charge.amount_refunded>0)checked(await db().from('billing_invoices').update({status:'review'}).eq('id',invoice.id));
   return reply({received:true});
  }else if(event.type==='charge.refunded'||event.type.startsWith('charge.dispute.')) {
   const chargeId=event.type==='charge.refunded'?obj.id:obj.charge;
   checked(await db().from('billing_invoices').update({status:'review'}).eq('charge_id',chargeId).eq('livemode',mode));
  }else if(event.type==='transfer.reversed') {
   checked(await db().from('withdrawals').update({status:'review'}).eq('transfer_id',obj.id).eq('livemode',mode));
  }
  checked(await db().from('billing_events').upsert({id:event.id,livemode:mode}));return reply({received:true});
 }catch(e){console.error('Webhook reconciliation failed',e.message);return reply({error:'Reconciliation pending'},500);}
});
