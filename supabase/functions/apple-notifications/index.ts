import {db,checked} from '../_shared/billing.ts';
import {getAppleTransaction} from '../_shared/apple.ts';

type Notification = {
  notificationType?: string;
  subtype?: string;
  data?: { environment?: string; signedTransactionInfo?: string };
};

function decodePayload<T>(signedValue:string):T {
  const parts=signedValue.split('.');
  if(parts.length!==3) throw new Error('Invalid App Store notification.');
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((parts[1].length+3)%4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload),byte=>byte.charCodeAt(0)))) as T;
}

// App Store Server Notifications v2 arrive as a signed JWS. We only use its
// transaction id to fetch the canonical record from Apple's authenticated API.
Deno.serve(async req=>{
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const envelope=decodePayload<Notification>(await req.text());
    const signed=envelope.data?.signedTransactionInfo;
    if(!signed) throw new Error('Notification has no transaction.');
    const hinted=decodePayload<{transactionId:string}>(signed);
    const transaction=await getAppleTransaction(hinted.transactionId,envelope.data?.environment);
    const memberships=checked(await db().from('billing_memberships').select('*').eq('subscription_id',transaction.originalTransactionId).eq('livemode',true).limit(1));
    const membership=memberships[0];
    // Apple can send a lifecycle event before the app has finished recording
    // its first purchase; acknowledging it is safe and the client retry wins.
    if(!membership) return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});

    const expired=transaction.revocationDate || (transaction.expiresDate && transaction.expiresDate<Date.now());
    const type=envelope.notificationType||'';
    const cancelAtPeriodEnd=type==='DID_CHANGE_RENEWAL_STATUS'&&envelope.subtype==='AUTO_RENEW_DISABLED';
    const status=(expired||type==='EXPIRED'||type==='REFUND'||type==='REVOKE')?'canceled':'active';
    checked(await db().from('billing_memberships').update({status,cancel_at_period_end:cancelAtPeriodEnd}).eq('id',membership.id).eq('livemode',true));
    if(status==='active' && (type==='SUBSCRIBED'||type==='DID_RENEW')) {
      const paidAt=new Date(transaction.purchaseDate).toISOString();
      checked(await db().rpc('record_paid_invoice',{
        event_id:`apple:${transaction.transactionId}`,mode:true,membership:membership.id,
        invoice_id:`apple:${transaction.transactionId}`,intent_id:`apple:${transaction.transactionId}`,
        charge:`apple:${transaction.transactionId}`,gross:180,fee:0,paid:paidAt,available:paidAt,issued:paidAt,
      }));
    }
    return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
  } catch(error) {
    console.error('Apple notification failed',error);
    return new Response(JSON.stringify({error:'Unable to process App Store notification.'}),{status:400,headers:{'Content-Type':'application/json'}});
  }
});
