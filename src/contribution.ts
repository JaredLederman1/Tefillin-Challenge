export const MIN_CONTRIBUTION=180;
export const MAX_CONTRIBUTION=1800;
export const STRIPE_FIXED_FEE_CENTS=30;
export const STRIPE_PERCENT_FEE=0.03;

/** Amount charged so the selected contribution remains after a 30¢ + 3% fee. */
export function chargeWithStripeFeeCovered(contributionCents:number) {
  return Math.ceil((contributionCents+STRIPE_FIXED_FEE_CENTS)/(1-STRIPE_PERCENT_FEE));
}

export function stripeFeeCents(chargeCents:number) {
  return Math.ceil(chargeCents*STRIPE_PERCENT_FEE)+STRIPE_FIXED_FEE_CENTS;
}
export function hasPaidAccess(membership:{status:string;access_expires_at?:string|null;subscription_id?:string|null}|null,_legacyMonths:string[]=[],_today?:string,now=Date.now()) {
  if(membership?.status!=='active')return false;
  const expires=Date.parse(membership.access_expires_at||'');
  // Only a server-verified unexpired entitlement grants App Store access.
  return Number.isFinite(expires)&&expires>now;
}
export function sliderCents(x:number,width:number) {
  const values=[180,...Array.from({length:17},(_,index)=>(index+2)*100)];
  const index=Math.max(0,Math.min(values.length-1,Math.round((values.length-1)*x/Math.max(1,width))));
  return values[index];
}
