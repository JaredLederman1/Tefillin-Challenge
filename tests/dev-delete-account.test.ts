import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/dev-delete-account/index.ts',import.meta.url),'utf8').replace(/import \{createClient\} from [^;]+;/,'');
function harness({authenticated=true,payment=false,storageError=false,subscriptionStatus,appleSubscription=false,lastSignInAt=new Date().toISOString()}:{authenticated?:boolean;payment?:boolean;storageError?:boolean;subscriptionStatus?:number;appleSubscription?:boolean;lastSignInAt?:string}={}) {
 const removed:string[][]=[];const deleted:string[]=[];let listed=false;let handler:any;const networkCalls:string[]=[];
 const db={auth:{getUser:async()=>({data:{user:authenticated?{id:'current-user',last_sign_in_at:lastSignInAt}:null},error:null}),admin:{deleteUser:async(id:string)=>{deleted.push(id);return {error:null};}}},from:(table:string)=>({select:()=>({eq:()=>({limit:async()=>({data:payment?[{user_id:'current-user'}]:[],error:null}),then:undefined})}),delete:()=>({eq:async()=>({error:null}),in:async()=>({error:null})}),...table==='billing_memberships'?{select:()=>({eq:async()=>({data:payment?[{id:'membership',subscription_id:appleSubscription?'2000000000000001':subscriptionStatus?'sub_test':null,livemode:false}]:[],error:null})})}:{}}),storage:{from:()=>({list:async()=>{if(storageError)return {error:new Error('Storage unavailable')};const data=listed?[]:[{id:'photo',name:'photo.jpg'}];listed=true;return {data,error:null};},remove:async(paths:string[])=>{removed.push(paths);return {error:null};}})}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{createClient:()=>db,Deno:{env:{get:()=> 'test'},serve:(fn:any)=>{handler=fn;}},fetch:async(url:string)=>{networkCalls.push(url);return new Response('{}',{status:subscriptionStatus??200});},Response,Error});
 return {deleted,removed,networkCalls,call:(body:unknown={confirmation:'DELETE'},token='test')=>handler(new Request('http://localhost',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)}))};
}
test('dev deletion requires authentication and explicit confirmation',async()=>{
 const a=harness({authenticated:false});assert.equal((await a.call()).status,401);assert.deepEqual(a.deleted,[]);
 const b=harness();assert.equal((await b.call({},'')).status,401);assert.equal((await b.call({})).status,400);assert.deepEqual(b.deleted,[]);
});
test('dev deletion accepts an authenticated stale sign-in session',async()=>{
 const h=harness({lastSignInAt:new Date(Date.now()-11*60*1000).toISOString()});
 assert.equal((await h.call()).status,200);assert.deepEqual(h.deleted,['current-user']);
});
test('dev deletion clears development payment records before deleting the account',async()=>{
 const h=harness({payment:true});assert.equal((await h.call()).status,200);assert.deepEqual(h.removed,[['current-user/photo.jpg']]);assert.deepEqual(h.deleted,['current-user']);
});
test('dev deletion stops if storage cleanup fails',async()=>{
 const h=harness({storageError:true});assert.equal((await h.call()).status,400);assert.deepEqual(h.deleted,[]);
});
test('dev deletion permits a stale Stripe subscription that is already gone',async()=>{
 const h=harness({payment:true,subscriptionStatus:404});assert.equal((await h.call()).status,200);assert.deepEqual(h.deleted,['current-user']);
});
test('dev deletion only deletes the authenticated caller even with another ID supplied',async()=>{
 const h=harness();const response=await h.call({confirmation:'DELETE',userId:'another-user'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true,appStoreSubscriptionMayRemain:false});assert.deepEqual(h.removed,[['current-user/photo.jpg']]);assert.deepEqual(h.deleted,['current-user']);
});

test('Apple subscriptions permit deletion without Stripe calls and report renewal warning',async()=>{
 const h=harness({payment:true,appleSubscription:true});
 const response=await h.call();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{deleted:true,appStoreSubscriptionMayRemain:true});
 assert.deepEqual(h.networkCalls,[]);
 assert.deepEqual(h.deleted,['current-user']);
});
test('failed Stripe cancellation prevents account deletion',async()=>{
 const h=harness({payment:true,subscriptionStatus:500});
 assert.equal((await h.call()).status,400);
 assert.deepEqual(h.deleted,[]);
 assert.equal(h.networkCalls.length,1);
});
