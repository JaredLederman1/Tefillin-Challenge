// Read-only authentication probe. Prints statuses only, never keys or JWTs.
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync,spawnSync} from 'node:child_process';
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
const js=ts.transpile(source.replace("npm:jsrsasign@11.1.5",import.meta.resolve('jsrsasign'))+'\nexport {appStoreToken};',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {appStoreToken,getAppleTransaction,verifyApplePurchase,verifyDeviceTransaction}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
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
  if(process.argv.includes('--signed-proof-check')){
   const detail=await fetch(`https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${hint.transactionId}`,{headers:{Authorization:`Bearer ${await appStoreToken()}`}});
   const signed=(await detail.json()).signedTransactionInfo;
   const proof=await verifyDeviceTransaction(signed,'Sandbox');
   console.log(JSON.stringify({check:'Apple-signed transaction proof',passed:proof.transactionId===transaction.transactionId}));
   const [header,payload,signature]=signed.split('.');
   let forgedRejected=false;
   try{await verifyDeviceTransaction(`${header}.${payload}.${signature[0]==='A'?'B':'A'}${signature.slice(1)}`,'Sandbox');}catch{forgedRejected=true;}
   console.log(JSON.stringify({check:'tampered transaction rejection',passed:forgedRejected}));
   if(!forgedRejected)process.exitCode=1;
   if(process.argv.includes('--edge-runtime-check')){
    const edge=spawnSync('npx',['--yes','deno','run','--allow-net','scripts/check-apple-edge.ts'],{input:signed,encoding:'utf8',timeout:90000});
    if(edge.stdout.trim())console.log(edge.stdout.trim());
    if(edge.status!==0){console.log(JSON.stringify({check:'Deno verifier process',status:edge.status,stderr:edge.stderr.replace(/[A-Za-z0-9_-]{80,}/g,'[redacted]').slice(-600)}));process.exitCode=1;}
   }
  }
  console.log(JSON.stringify({check:'actual sandbox transaction lookup',verified:true,environment:transaction.environment,hasAccountToken:!!transaction.appAccountToken,expired:transaction.expiresDate<Date.now()}));
  console.log(JSON.stringify({check:'transaction metadata',renewal:transaction.transactionId!==transaction.originalTransactionId,uppercaseAccountToken:transaction.appAccountToken!==transaction.appAccountToken?.toLowerCase()}));
  if(process.argv.includes('--account-check')){
   if(!/^[0-9a-f-]{36}$/i.test(transaction.appAccountToken||''))throw new Error('Cannot check a missing or invalid account token.');
   const sql=`select exists(select 1 from auth.users where id='${transaction.appAccountToken}'::uuid) as purchase_account_exists, coalesce((select id='${transaction.appAccountToken}'::uuid from auth.users where exists(select 1 from auth.identities where user_id=auth.users.id and provider='apple') order by last_sign_in_at desc nulls last limit 1),false) as matches_latest_apple_account;`;
   console.log(execFileSync('npx',['--yes','supabase','db','query','--linked','--output','json',sql],{encoding:'utf8',timeout:30000}));
   const auditSql=`select payload->>'action' as action, payload->'traits'->>'provider' as provider, array(select json_object_keys(payload)) as fields, coalesce(payload->>'actor_username'=(select email from auth.users where exists(select 1 from auth.identities where user_id=auth.users.id and provider='apple') order by last_sign_in_at desc nulls last limit 1),false) as matches_latest_apple_email from auth.audit_log_entries where payload->>'actor_id'='${transaction.appAccountToken}' order by created_at desc limit 5;`;
   console.log(execFileSync('npx',['--yes','supabase','db','query','--linked','--output','json',auditSql],{encoding:'utf8',timeout:30000}));
  }
  try{
   await verifyApplePurchase(transaction,transaction.appAccountToken);
   console.log(JSON.stringify({check:'actual purchase validation',passed:true}));
  }catch(error){console.log(JSON.stringify({check:'actual purchase validation',error:error.message}));process.exitCode=1;}
 }
}
