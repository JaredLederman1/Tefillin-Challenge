import test from 'node:test';
import assert from 'node:assert/strict';
import {canPromptCharityVote,companyBudgetLabel,votePromptKey,type CharityVoteStatus} from '../src/charity-vote.ts';
const status:CharityVoteStatus={month:'2026-11-01',closesAt:'2026-12-01T05:00:00Z',status:'open',voteCauseId:null,eligible:true,qualificationMonth:'2026-10-01',qualificationMonthEnded:true,completionEligible:true,subscriptionEligible:true,requiredDays:22,completedDays:22,pendingReviewDays:0,missingDays:0,budgetCents:null,subscriberCount:null,candidates:[],reports:[]};
test('only qualified members with an open uncast vote receive the congratulations prompt',()=>{
 assert.equal(canPromptCharityVote(status),true);
 for(const patch of [{eligible:false},{qualificationMonthEnded:false},{completionEligible:false},{voteCauseId:'charity-a'},{status:'closed' as const}])assert.equal(canPromptCharityVote({...status,...patch}),false);
 assert.equal(Boolean(canPromptCharityVote({eligible:true,status:'open',voteCauseId:null} as CharityVoteStatus)),false);
});
test('dismissal keys isolate members and allocation months',()=>{
 assert.notEqual(votePromptKey('member-a','2026-11-01'),votePromptKey('member-b','2026-11-01'));
 assert.notEqual(votePromptKey('member-a','2026-11-01'),votePromptKey('member-a','2026-12-01'));
});
test('company allocation amounts are displayed only when actual nonnegative cents are supplied',()=>{
 assert.equal(companyBudgetLabel(null),null);assert.equal(companyBudgetLabel(undefined),null);
 assert.equal(companyBudgetLabel(-1),null);assert.equal(companyBudgetLabel(NaN),null);assert.equal(companyBudgetLabel(1.5),null);
 assert.equal(companyBudgetLabel(0),'$0.00');assert.equal(companyBudgetLabel(180),'$1.80');
});
