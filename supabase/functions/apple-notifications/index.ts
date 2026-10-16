import {db,checked} from '../_shared/billing.ts';
import {getAppleTransaction,getAppleSubscriptionTransaction} from '../_shared/apple.ts';

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
    const payload=await req.json();
    if(typeof payload.signedPayload!=='string')throw new Error('Missing signed notification.');
    const envelope=decodePayload<Notification>(payload.signedPayload);
    const signed=envelope.data?.signedTransactionInfo;
    if(!signed) throw new Error('Notification has no transaction.');
    const hinted=decodePayload<{transactionId:string}>(signed);
    const hintedTransaction=await getAppleTransaction(hinted.transactionId,envelope.data?.environment);
    const transaction=await getAppleSubscriptionTransaction(hintedTransaction.originalTransactionId);
    const memberships=checked(await db().from('billing_memberships').select('*').eq('subscription_id',transaction.originalTransactionId).eq('livemode',true).limit(1));
    const membership=memberships[0];
    // Apple can send a lifecycle event before the app has finished recording
    // its first purchase; acknowledging it is safe and the client retry wins.
    if(!membership) return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});

    // Lifecycle hints are untrusted; canonical transaction expiry/revocation controls access.
    const expired=transaction.appAccountToken?.toLowerCase()!==membership.user_id.toLowerCase() || !!transaction.revocationDate || !transaction.expiresDate || transaction.expiresDate<=Date.now();
    checked(await db().from('billing_memberships').update({status:expired?'canceled':'active',access_expires_at:new Date(transaction.expiresDate||0).toISOString()}).eq('id',membership.id).eq('livemode',true));
    if(!expired) checked(await db().rpc('record_app_subscription',{
      member:membership.user_id,original_id:transaction.originalTransactionId,transaction_id:transaction.transactionId,
      environment:transaction.environment,purchased:new Date(transaction.purchaseDate).toISOString(),expires:new Date(transaction.expiresDate!).toISOString(),
    }));
    return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
  } catch(error) {
    console.error('Apple notification failed',error);
    return new Response(JSON.stringify({error:'Unable to process App Store notification.'}),{status:400,headers:{'Content-Type':'application/json'}});
  }
});
