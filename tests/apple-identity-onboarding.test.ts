import test from 'node:test';
import assert from 'node:assert/strict';
import {appleFullName,captureAppleName,recoveredIdentityName,isAppleIdentity,savedIdentityName} from '../src/apple-identity.ts';
import {onboardingSteps} from '../src/onboarding-data.ts';

test('Apple one-time full name survives canceled authentication and subsequent missing name',async()=>{
 const data=new Map<string,string>();
 const storage={getItem:async(key:string)=>data.get(key)||null,setItem:async(key:string,value:string)=>{data.set(key,value);}};
 assert.equal(await captureAppleName(storage,{user:'subject-a',fullName:{givenName:' Jared ',middleName:null,familyName:'Lederman'}}),'Jared Lederman');
 assert.equal(await captureAppleName(storage,{user:'subject-a',fullName:null}),'Jared Lederman');
 assert.equal(await captureAppleName(storage,{user:'subject-b',fullName:null}),'');
 assert.equal(await recoveredIdentityName(storage,{identities:[{provider:'apple',identity_data:{sub:'subject-a'}}]}),'Jared Lederman');
 assert.equal(await recoveredIdentityName(storage,{user_metadata:{full_name:'Saved Name'},identities:[{provider:'apple',identity_data:{sub:'subject-a'}}]}),'Saved Name');
});

test('Apple provider detection includes linked identities and does not force a missing name',()=>{
 assert.equal(isAppleIdentity({app_metadata:{provider:'apple'}}),true);
 assert.equal(isAppleIdentity({identities:[{provider:'apple'}]}),true);
 assert.equal(isAppleIdentity({app_metadata:{provider:'email'}}),false);
 assert.equal(savedIdentityName({user_metadata:{full_name:null,name:' Existing Name '}}),'Existing Name');
 assert.equal(appleFullName(null),'');
 assert.equal(appleFullName({givenName:'A'.repeat(90)}).length,80);
});

test('ownership flows straight to community without a borrowing or purchasing step',()=>{
 assert.deepEqual(onboardingSteps(),['Full Name','Phone Number','School','Birthday','Tradition','Do you own tefillin?','Community']);
});
