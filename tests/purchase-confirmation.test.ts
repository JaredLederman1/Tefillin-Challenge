import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmPurchaseSteps} from '../src/purchase-confirmation.ts';

test('failed verification preserves the error and never finishes an unverified purchase',async()=>{
 const calls:string[]=[];
 await assert.rejects(confirmPurchaseSteps(async()=>{throw new Error('Apple verification failed');},async()=>{calls.push('finish');},async()=>{calls.push('refresh');},20),/Apple verification failed/);
 assert.deepEqual(calls,[]);
});
test('hung verification times out and permits an explicit successful retry',async()=>{
 await assert.rejects(confirmPurchaseSteps(()=>new Promise(()=>{}),async()=>{},async()=>{},20),/verification timed out/);
 const calls:string[]=[];
 await confirmPurchaseSteps(async()=>{calls.push('verify');},async()=>{calls.push('finish');},async()=>{calls.push('refresh');},20);
 assert.deepEqual(calls,['verify','finish','refresh']);
});
test('hung StoreKit finishing still refreshes verified account access',async()=>{
 let refreshed=false;
 await assert.rejects(confirmPurchaseSteps(async()=>{},()=>new Promise(()=>{}),async()=>{refreshed=true;},20),/transaction is still processing/);
 assert.equal(refreshed,true);
});
test('account refresh cannot leave purchase confirmation pending forever',async()=>{
 await assert.rejects(confirmPurchaseSteps(async()=>{},async()=>{},()=>new Promise(()=>{}),20),/account refresh timed out/);
});
