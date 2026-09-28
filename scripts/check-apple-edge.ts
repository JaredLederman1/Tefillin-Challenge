// Read a signed Apple transaction from stdin; never print or persist the JWS.
import {verifyDeviceTransaction} from '../supabase/functions/_shared/apple.ts';

const edgeDeno=Deno as unknown as {stdin:{readable:ReadableStream<Uint8Array>};exit:(code:number)=>never};
const signed=await new Response(edgeDeno.stdin.readable).text();
try{
 const transaction=await verifyDeviceTransaction(signed.trim(),'Sandbox');
 console.log(JSON.stringify({check:'Deno StoreKit JWS verification',passed:!!transaction.transactionId}));
}catch(error){
 const issue=error as {status?:unknown;cause?:unknown;message?:unknown};
 const cause=issue.cause as {name?:unknown;message?:unknown}|undefined;
 const clean=(value:unknown)=>String(value??'').replace(/[A-Za-z0-9_-]{80,}/g,'[redacted]').slice(0,220);
 console.log(JSON.stringify({check:'Deno StoreKit JWS verification',passed:false,name:error instanceof Error?error.name:null,message:clean(issue.message),status:issue.status??null,causeName:clean(cause?.name),causeMessage:clean(cause?.message)}));
 edgeDeno.exit(1);
}
