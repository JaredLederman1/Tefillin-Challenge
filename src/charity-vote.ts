export const charityVoteRules = 'One vote per member each month. Voting closes at midnight New York time when the next month begins. The most votes wins; ties, including no votes, use the candidate order shown.';
export const companyDonationPolicy = 'Ratzon donates 100% of positive monthly net profit: received subscription revenue less App Store fees, refunds, applicable taxes, and documented operating costs. Donations are made by Ratzon; votes select the recipient. Subscriptions do not create a personal donation balance.';
export type CharityCandidate = {id:string;name:string;description:string|null;websiteUrl:string|null;tieRank:number;votes:number};
export type CompanyDonationReport = {month:string;recipient:string;donationCents:number|null;donatedAt:string|null;receiptUrl:string|null};
export type CharityVoteStatus = {month:string;closesAt:string;status:'open'|'closed';voteCauseId:string|null;eligible:boolean;candidates:CharityCandidate[];reports:CompanyDonationReport[]};
export function voteWinner(candidates:CharityCandidate[]):CharityCandidate|undefined {
 return [...candidates].sort((a,b)=>b.votes-a.votes||a.tieRank-b.tieRank)[0];
}
export function safeReceiptUrl(url:string|null):string|null {
 if(!url)return null;
 try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.href:null;}catch{return null;}
}
