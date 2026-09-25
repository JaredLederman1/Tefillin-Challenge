export { billingAction, paymentsLive } from './billing-client';

export async function subscribeContribution(_amountCents: number, _coversStripeFee=false): Promise<boolean> {
  throw new Error('Open the native app to subscribe.');
}
