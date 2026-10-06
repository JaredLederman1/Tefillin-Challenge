export const charityVoteRules = 'Members who completed every required day in the previous month can vote once on the allocation of Ratzon’s company donation. Voting closes at midnight New York time when the next month begins. The most votes wins; ties, including no votes, use the candidate order shown.';
export const companyDonationPolicy = 'Ratzon donates 100% of positive monthly net profit: received subscription revenue less App Store fees, refunds, applicable taxes, and documented operating costs. Donations are made by Ratzon; votes select the recipient. Subscriptions do not create a personal donation balance.';
export type CharityCandidate = {id:string;name:string;description:string|null;websiteUrl:string|null;tieRank:number;votes:number};
export type CompanyDonationReport = {month:string;recipient:string;donationCents:number|null;donatedAt:string|null;receiptUrl:string|null};
export type CharityVoteStatus = {month:string;closesAt:string;status:'open'|'closed';voteCauseId:string|null;eligible:boolean;qualificationMonth:string;qualificationMonthEnded:boolean;completionEligible:boolean;subscriptionEligible:boolean;requiredDays:number;completedDays:number;pendingReviewDays:number;missingDays:number;budgetCents:number|null;subscriberCount:number|null;candidates:CharityCandidate[];reports:CompanyDonationReport[]};
export function votePromptKey(userId:string,month:string):string{return `ratzon:charity-vote-prompt:${userId}:${month}`;}
export function canPromptCharityVote(status:CharityVoteStatus):boolean{return status.eligible===true&&status.qualificationMonthEnded===true&&status.completionEligible===true&&status.status==='open'&&!status.voteCauseId;}
export function companyBudgetLabel(cents:number|null|undefined):string|null {
 return typeof cents==='number'&&Number.isSafeInteger(cents)&&cents>=0?(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'}):null;
}
export function voteWinner(candidates:CharityCandidate[]):CharityCandidate|undefined {
 return [...candidates].sort((a,b)=>b.votes-a.votes||a.tieRank-b.tieRank)[0];
}
export function safeReceiptUrl(url:string|null):string|null {
 if(!url)return null;
 try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.href:null;}catch{return null;}
}
