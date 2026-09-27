// Read-only authentication probe. Prints statuses only, never keys or JWTs.
import fs from 'node:fs';
import ts from 'typescript';
const keyPath=process.argv[2];
if(!keyPath) throw new Error('Pass the path to the existing Apple .p8 key.');
const env={APPLE_IAP_ISSUER_ID:'f36669c4-e669-4907-bb3f-07d2a14c93d4',APPLE_IAP_KEY_ID:'D34SSFXV73',APPLE_IAP_PRIVATE_KEY_BASE64:fs.readFileSync(keyPath).toString('base64')};
globalThis.Deno={env:{get:name=>env[name]}};
const source=fs.readFileSync(new URL('../supabase/functions/_shared/apple.ts',import.meta.url),'utf8');
for(const fixed of [false,true]) {
 const candidate=fixed?source:source.replace(',bid:APPLE_BUNDLE_ID','');
 const js=ts.transpile(candidate+'\nexport {appStoreToken};',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
 const {appStoreToken}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 for(const environment of ['sandbox','production']) {
  const host=environment==='sandbox'?'api.storekit-sandbox.itunes.apple.com':'api.storekit.itunes.apple.com';
  const response=await fetch(`https://${host}/inApps/v1/transactions/2000000000000000`,{headers:{Authorization:`Bearer ${await appStoreToken()}`}});
  const body=await response.text();
  let errorCode;try{errorCode=JSON.parse(body).errorCode;}catch{}
  console.log(JSON.stringify({version:fixed?'fixed':'previous',environment,status:response.status,errorCode}));
  if(fixed&&environment==='sandbox'&&(response.status!==404||errorCode!==4040010))process.exitCode=1;
 }
}
const js=ts.transpile(source+'\nexport {appStoreToken};',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {appStoreToken,getAppleTransaction,verifyApplePurchase}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const response=await fetch('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/notifications/history',{
 method:'POST',headers:{Authorization:`Bearer ${await appStoreToken()}`,'Content-Type':'application/json'},
 body:JSON.stringify({startDate:Date.now()-86400000,endDate:Date.now()})
});
console.log(JSON.stringify({check:'sandbox notification history',status:response.status}));
if(response.ok){
 const history=await response.json();
 const decode=value=>JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString());
 const transactions=(history.notificationHistory||[]).map(item=>decode(item.signedPayload).data?.signedTransactionInfo).filter(Boolean).map(decode);
 console.log(JSON.stringify({check:'recent transaction records',count:transactions.length}));
 const hint=transactions.sort((a,b)=>b.purchaseDate-a.purchaseDate)[0];
 if(hint){
  const transaction=await getAppleTransaction(hint.transactionId,'Sandbox');
  console.log(JSON.stringify({check:'actual sandbox transaction lookup',verified:true,environment:transaction.environment,hasAccountToken:!!transaction.appAccountToken,expired:transaction.expiresDate<Date.now()}));
  try{
   await verifyApplePurchase(transaction,transaction.appAccountToken);
   console.log(JSON.stringify({check:'actual purchase validation',passed:true}));
  }catch(error){console.log(JSON.stringify({check:'actual purchase validation',error:error.message}));process.exitCode=1;}
 }
}
