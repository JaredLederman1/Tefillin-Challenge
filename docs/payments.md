# Levav — Stripe payment plan

Stripe native test checkout is installed and the authenticated `stripe-test-payment` Edge Function is deployed. The publishable test key is in the ignored app `.env`; the secret test key is stored in Supabase secrets. Neither production enrollment nor wallet balance changes when a test payment succeeds. Live charging, recurring billing, Connect payouts and donations are not implemented or enabled.

To try it, rebuild the native app with `npm run build:ios`, install that build, sign in, open Challenge → Monthly contribution → Test card payment. Use Stripe's test card `4242 4242 4242 4242`, a future expiry and any three-digit CVC. An existing build without Stripe displays an explanatory message rather than crashing.

The endpoint enforces signed-in users, test-only credentials, $5–$1,000 integer-cent amounts, idempotency per checkout attempt, and ownership when checking status. The native app checks server-confirmed success. It does not subscribe a participant or process recurring payments. Webhook-backed accounting remains part of the live integration below.

Rotate the test secret shared in chat and update Supabase's `STRIPE_SECRET_KEY` secret; never prefix a secret with `EXPO_PUBLIC_` or include it in the app bundle.

## Eligibility comes first

This product collects monthly commitments and redistributes forfeitures to successful participants. Stripe's prohibited-business list includes entry fees promising prizes of value. Obtain a written determination from Stripe for this exact model before committing to a live integration; Connect does not remove that restriction. If unsupported, revise the financial model or find a provider that explicitly supports it.

Source: https://stripe.com/legal/restricted-businesses

## Proposed integration, subject to eligibility

1. Use Stripe's native React Native PaymentSheet for payment details. Supabase Edge Functions create payments server-side, enforce the contribution minimum and associate each payment with an authenticated user and challenge month. Secret keys remain server-side. Adding the native SDK requires a new Expo development build.
2. Support monthly recurring commitments through Billing with explicit consent. Define the first eligible month and collect before it starts, matching the current full-month enrollment rule. Failed or late payments cannot create an eligible enrollment. Contribution changes take effect next month.
3. Verify signed webhook events and deduplicate Stripe event IDs and payment IDs in the database. Only a confirmed successful payment creates an enrollment. Never trust the app's payment-success screen. Handle delayed, duplicate, out-of-order, refunded and disputed payments.
4. Keep challenge eligibility and cent-exact settlement in Supabase. The existing settlement credits returned principal plus the weighted bonus to the internal ledger; this is an accounting record, not a Stripe transfer or bank payout.
5. Evaluate Connect for approved payout recipients, identity verification and bank payouts. Confirm that recipient type, countries, holding periods and accumulated balances are supported. Reserve wallet amounts atomically before sending transfers, use idempotency keys, reconcile webhooks and release reservations on failure to prevent duplicate withdrawals or donations.
6. Donations need verified recipient organizations and a recorded user instruction. Do not label a donation completed until the provider confirms it. Define receipts, fees and treatment of refunds before enabling donations.

Official implementation references:
- https://docs.stripe.com/payments/accept-a-payment?platform=react-native
- https://docs.stripe.com/billing/subscriptions/overview
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/webhooks

## Distribution status and decisions

The allocation helper distributes forfeitures in proportion to successful participants' original contributions, rounds down to whole cents, and assigns remaining cents by largest fractional remainder with a stable tie-break. The SQL settlement uses numeric arithmetic, locks the month, requires approved daily photos except Saturday, and is idempotent. Only the service role may settle.

Example: two finishers contributed $18 and $36; $10 was forfeited. Their bonuses are $3.33 and $6.67, respectively; returned principal makes their credits $21.33 and $42.67.

Local allocation tests pass. The transactional database test also previously verified those credits, conservation of funds, repeat settlement and access controls. These checks do not constitute end-to-end payment testing.

Decisions still required before live settlement:
- Who pays processing fees and chargebacks? The existing calculation uses gross contributions; a fully distributed gross pool needs fees funded separately.
- What happens when nobody completes the month? The helper models rollover, but production SQL stops for an explicit policy decision; automatic rollover is not implemented.
- Who reviews photos, and how are appeals resolved? Settlement waits for pending reviews.
- Confirm calendar exemptions beyond Saturday, including applicable Jewish holidays and participant custom.

Before launch, test payment failures, duplicate webhooks, refunds/disputes, month boundaries, concurrent withdrawal attempts, failed payouts and reconciliation in Stripe's test environment.
