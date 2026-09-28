export function isSubscriptionConflict(message:string) {
 return /subscription/i.test(message)&&/(different|another|already active|linked)/i.test(message);
}
