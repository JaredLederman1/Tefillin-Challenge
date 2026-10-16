import test from 'node:test';
import assert from 'node:assert/strict';
import {voteWinner,safeReceiptUrl,type CharityCandidate} from '../src/charity-vote.ts';
const candidate=(id:string,votes:number,tieRank:number):CharityCandidate=>({id,votes,tieRank,name:id,description:null,websiteUrl:null});
test('highest vote total wins and ties including zero use published candidate order',()=>{
 assert.equal(voteWinner([candidate('b',5,2),candidate('a',2,1)])?.id,'b');
 assert.equal(voteWinner([candidate('b',5,2),candidate('a',5,1)])?.id,'a');
 assert.equal(voteWinner([candidate('b',0,2),candidate('a',0,1)])?.id,'a');
 assert.equal(voteWinner([]),undefined);
});
test('donation confirmations only open HTTPS URLs',()=>{
 assert.equal(safeReceiptUrl('javascript:alert(1)'),null);
 assert.equal(safeReceiptUrl('http://example.com'),null);
 assert.equal(safeReceiptUrl('https://example.com/receipt'),'https://example.com/receipt');
});

import {hasPaidAccess} from '../src/contribution.ts';
test('only an active unexpired verified entitlement grants access, never legacy enrollment',()=>{
 const now=Date.parse('2026-10-06T12:00:00Z');
 assert.equal(hasPaidAccess({status:'active',access_expires_at:'2026-11-01T00:00:00Z'},[],undefined,now),true);
 for(const membership of [null,{status:'active'},{status:'active',access_expires_at:'invalid'},{status:'active',access_expires_at:'2026-10-01T00:00:00Z'},{status:'canceled',access_expires_at:'2026-11-01T00:00:00Z'}])assert.equal(hasPaidAccess(membership,['2026-11-01'],'2026-10-06',now),false);
});
