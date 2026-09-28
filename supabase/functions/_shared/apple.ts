const text = new TextEncoder();

export const APPLE_MONTHLY_PRODUCT_ID = 'com.jaredlederman.tefillinchallenge.monthly_contribution';
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

// Apple Root CA - G3, downloaded from Apple's PKI site. Pin its digest so a
// substituted certificate cannot turn a forged device transaction into proof.
const APPLE_ROOT_CA_URL='https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';
const APPLE_ROOT_CA_SHA256='63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
let rootCertificate:Promise<Uint8Array>|undefined;
async function appleRootCertificate(){
 rootCertificate??=(async()=>{
  const response=await fetch(APPLE_ROOT_CA_URL);
  if(!response.ok)throw new Error('Apple purchase verification is temporarily unavailable.');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==APPLE_ROOT_CA_SHA256)throw new Error('Apple purchase verification certificate changed.');
  return bytes;
 })().catch(error=>{rootCertificate=undefined;throw error;});
 return rootCertificate;
}

/** A signed StoreKit transaction from the device proves access to this Apple purchase. */
export async function verifyDeviceTransaction(signedTransactionInfo:string,environment?:string|null):Promise<AppleTransaction>{
 if(typeof signedTransactionInfo!=='string'||signedTransactionInfo.split('.').length!==3)throw new Error('A signed App Store transaction is required to restore a subscription.');
 const {SignedDataVerifier,Environment}=await import('npm:@apple/app-store-server-library@3.1.0');
 const appAppleId=6812479409;
 const verifier=new SignedDataVerifier([Buffer.from(await appleRootCertificate())],true,environment==='Production'?Environment.PRODUCTION:Environment.SANDBOX,APPLE_BUNDLE_ID,appAppleId);
 let transaction:AppleTransaction;
 try{transaction=await verifier.verifyAndDecodeTransaction(signedTransactionInfo) as AppleTransaction;}
 catch{throw new Error('The App Store transaction could not be authenticated.');}
 if(transaction.productId!==APPLE_MONTHLY_PRODUCT_ID||transaction.type!=='Auto-Renewable Subscription'||transaction.revocationDate||!transaction.expiresDate||transaction.expiresDate<Date.now())throw new Error('No active Ratzon subscription was found for this Apple account.');
 return transaction;
}

/** Tell Apple which current Ratzon account owns a restored, orphaned purchase. */
export async function setAppleAppAccountToken(originalTransactionId:string,accountToken:string,environment:'Sandbox'|'Production'){
 if(!/^\d+$/.test(originalTransactionId)||!ConfigUUID.test(accountToken))throw new Error('Invalid subscription recovery request.');
 const host=environment==='Production'?'https://api.storekit.apple.com':'https://api.storekit-sandbox.apple.com';
 const response=await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(originalTransactionId)}/appAccountToken`,{method:'PUT',headers:{Authorization:`Bearer ${await appStoreToken()}`,'Content-Type':'application/json'},body:JSON.stringify({appAccountToken:accountToken})});
 if(!response.ok)throw new Error(`Apple could not restore this subscription (HTTP ${response.status}).`);
}
const ConfigUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const encodedPrivateKey=Deno.env.get('APPLE_IAP_PRIVATE_KEY_BASE64');
  const privateKey=encodedPrivateKey
    ? new TextDecoder().decode(decodeBase64(encodedPrivateKey))
    : Deno.env.get('APPLE_IAP_PRIVATE_KEY')?.replace(/\\n/g,'\n');
  if(!issuer||!keyId||!privateKey) throw new Error('App Store purchase verification is not configured yet.');
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(text.encode(JSON.stringify({alg:'ES256',kid:keyId,typ:'JWT'})));
  const claims=base64Url(text.encode(JSON.stringify({iss:issuer,iat:now,exp:now+300,aud:'appstoreconnect-v1',bid:APPLE_BUNDLE_ID})));
  const key=await crypto.subtle.importKey('pkcs8',decodeBase64(privateKey.replace(/-----[^-]+-----|\s/g,'')),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,text.encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

async function fetchTransaction(transactionId:string,environment:'Sandbox'|'Production') {
  const host=environment==='Production'?'https://api.storekit.itunes.apple.com':'https://api.storekit-sandbox.itunes.apple.com';
  const response=await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,{headers:{Authorization:`Bearer ${await appStoreToken()}`}});
  if(!response.ok) throw new Error(`Apple could not verify this purchase (HTTP ${response.status}, ${environment}).`);
  const body=await response.json();
  if(typeof body.signedTransactionInfo!=='string') throw new Error('Apple returned an incomplete transaction record.');
  return decodePayload<AppleTransaction>(body.signedTransactionInfo);
}

/**
 * Look up a transaction from Apple's authenticated Server API. Notifications
 * are deliberately reconciled through this API instead of trusting their
 * decoded JWS payload alone.
 */
export async function getAppleTransaction(transactionId:string, environment?:string|null) {
  if(!/^\d+$/.test(transactionId)) throw new Error('Invalid App Store transaction identifier.');
  const requested=environment==='Production'?'Production':'Sandbox';
  const alternate=requested==='Production'?'Sandbox':'Production';
  let latestError:unknown;
  // StoreKit can report a TestFlight transaction before it has propagated to
  // the Server API. It can also omit/mislabel its environment in some bridge
  // versions, so try both endpoints and retry the short propagation window.
  for (const delay of [0, 1500, 3000]) {
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    for (const candidate of [requested,alternate] as const) {
      try {
        const transaction=await fetchTransaction(transactionId,candidate);
        if(transaction.productId!==APPLE_MONTHLY_PRODUCT_ID||transaction.bundleId!==APPLE_BUNDLE_ID) throw new Error('Unexpected App Store transaction.');
        return transaction;
      } catch(error) {
        // Preserve the requested environment's error instead of masking it
        // with an unrelated authentication failure from the fallback host.
        if(candidate===requested) latestError=error;
      }
    }
  }
  throw latestError instanceof Error ? latestError : new Error('Apple could not verify this purchase.');
}

/** Verify the transaction with Apple before any entitlement or wallet credit is created. */
export async function verifyApplePurchase(input:{transactionId:string;originalTransactionId:string;productId:string;environment?:string|null;appAccountToken:string},expectedAccountToken:string) {
  if(input.productId!==APPLE_MONTHLY_PRODUCT_ID) throw new Error('Unexpected App Store product.');
  if(!/^\d+$/.test(input.transactionId)||!/^\d+$/.test(input.originalTransactionId)) throw new Error('Invalid App Store transaction identifier.');
  const transaction=await getAppleTransaction(input.transactionId,input.environment);
  if(transaction.transactionId!==input.transactionId||transaction.originalTransactionId!==input.originalTransactionId||transaction.revocationDate) throw new Error('App Store transaction validation failed.');
  if(transaction.appAccountToken?.toLowerCase()!==expectedAccountToken.toLowerCase()) throw new Error('This Apple subscription is linked to a different Ratzon account. Sign in to the original account or contact support if it was deleted.');
  if(transaction.type!=='Auto-Renewable Subscription') throw new Error('This App Store product is not a subscription.');
  if(transaction.expiresDate&&transaction.expiresDate<Date.now()) throw new Error('This subscription is no longer active.');
  return transaction;
}
