import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';

test('Apple verifier sends required bundle claim and validates purchase ownership',async()=>{
 const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const env={APPLE_IAP_ISSUER_ID:'test-issuer',APPLE_IAP_KEY_ID:'test-key',APPLE_IAP_PRIVATE_KEY_BASE64:Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64')};
 const runtime=globalThis as any;
 const originalDeno=runtime.Deno,originalFetch=globalThis.fetch;
 runtime.Deno={env:{get:(name:string)=>env[name as keyof typeof env]}};
 const transaction={transactionId:'2000000000000001',originalTransactionId:'2000000000000001',productId:'com.jaredlederman.tefillinchallenge.monthly_contribution',bundleId:'com.jaredlederman.tefillinchallenge',environment:'Sandbox',appAccountToken:'member-1',type:'Auto-Renewable Subscription',purchaseDate:Date.now(),expiresDate:Date.now()+3600000};
 const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{
  calls.push(String(input));
  const token=new Headers(init?.headers).get('Authorization')!.slice(7);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  assert.equal(claims.bid,transaction.bundleId);
  assert.equal(claims.aud,'appstoreconnect-v1');
  return Response.json({signedTransactionInfo:`header.${Buffer.from(JSON.stringify(transaction)).toString('base64url')}.signature`});
 };
 try{
  const source=readFileSync(new URL('../supabase/functions/_shared/apple.ts',import.meta.url),'utf8');
  const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
  const {verifyApplePurchase}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  assert.equal((await verifyApplePurchase(transaction,'member-1')).transactionId,transaction.transactionId);
  assert.equal((await verifyApplePurchase(transaction,'MEMBER-1')).transactionId,transaction.transactionId);
  await assert.rejects(()=>verifyApplePurchase(transaction,'wrong-member'),/linked to a different Ratzon account/);
  Object.assign(transaction,{revocationDate:Date.now()});
  await assert.rejects(()=>verifyApplePurchase(transaction,'member-1'),/validation failed/);
  assert.ok(calls.every(url=>url.includes('storekit-sandbox')));
 }finally{runtime.Deno=originalDeno;globalThis.fetch=originalFetch;}
});
