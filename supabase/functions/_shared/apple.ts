const text = new TextEncoder();

export const APPLE_MONTHLY_PRODUCT_ID = 'com.jaredlederman.tefillinchallenge.monthly-contribution';
export const APPLE_BUNDLE_ID = 'com.jaredlederman.tefillinchallenge';

type AppleTransaction = {
  appAccountToken?: string;
  bundleId: string;
  environment: 'Sandbox' | 'Production';
  expiresDate?: number;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  revocationDate?: number;
  transactionId: string;
  type: string;
};

function base64Url(bytes: Uint8Array) {
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function decodeBase64(value: string) {
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4);
  const binary=atob(normalized); return Uint8Array.from(binary,byte=>byte.charCodeAt(0));
}

function decodePayload<T>(signedValue: string): T {
  const [,payload,signature,...extra]=signedValue.split('.');
  if(!payload||!signature||extra.length) throw new Error('Invalid App Store transaction data.');
  return JSON.parse(new TextDecoder().decode(decodeBase64(payload))) as T;
}

async function appStoreToken() {
  const issuer=Deno.env.get('APPLE_IAP_ISSUER_ID');
  const keyId=Deno.env.get('APPLE_IAP_KEY_ID');
  const privateKey=Deno.env.get('APPLE_IAP_PRIVATE_KEY')?.replace(/\\n/g,'\n');
  if(!issuer||!keyId||!privateKey) throw new Error('App Store purchase verification is not configured yet.');
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(text.encode(JSON.stringify({alg:'ES256',kid:keyId,typ:'JWT'})));
  const claims=base64Url(text.encode(JSON.stringify({iss:issuer,iat:now,exp:now+300,aud:'appstoreconnect-v1'})));
  const key=await crypto.subtle.importKey('pkcs8',decodeBase64(privateKey.replace(/-----[^-]+-----|\s/g,'')),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,text.encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

async function fetchTransaction(transactionId:string,environment:'Sandbox'|'Production') {
  const host=environment==='Production'?'https://api.storekit.itunes.apple.com':'https://api.storekit-sandbox.itunes.apple.com';
  const response=await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,{headers:{Authorization:`Bearer ${await appStoreToken()}`}});
  if(!response.ok) throw new Error('Apple could not verify this purchase.');
  const body=await response.json();
  if(typeof body.signedTransactionInfo!=='string') throw new Error('Apple returned an incomplete transaction record.');
  return decodePayload<AppleTransaction>(body.signedTransactionInfo);
}

/** Verify the transaction with Apple before any entitlement or wallet credit is created. */
export async function verifyApplePurchase(input:{transactionId:string;originalTransactionId:string;productId:string;environment?:string|null;appAccountToken:string},expectedAccountToken:string) {
  if(input.productId!==APPLE_MONTHLY_PRODUCT_ID) throw new Error('Unexpected App Store product.');
  if(!/^\d+$/.test(input.transactionId)||!/^\d+$/.test(input.originalTransactionId)) throw new Error('Invalid App Store transaction identifier.');
  const requested=input.environment==='Production'?'Production':'Sandbox';
  let transaction:AppleTransaction;
  try { transaction=await fetchTransaction(input.transactionId,requested); }
  catch(error) {
    if(requested==='Production') transaction=await fetchTransaction(input.transactionId,'Sandbox');
    else throw error;
  }
  if(transaction.transactionId!==input.transactionId||transaction.originalTransactionId!==input.originalTransactionId||transaction.productId!==APPLE_MONTHLY_PRODUCT_ID||transaction.bundleId!==APPLE_BUNDLE_ID||transaction.appAccountToken!==expectedAccountToken||transaction.revocationDate) throw new Error('App Store transaction validation failed.');
  if(transaction.type!=='Auto-Renewable Subscription') throw new Error('This App Store product is not a subscription.');
  if(transaction.expiresDate&&transaction.expiresDate<Date.now()) throw new Error('This subscription is no longer active.');
  return transaction;
}
