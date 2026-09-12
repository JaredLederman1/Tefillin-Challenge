# Levav payments

## Implemented

- Native Stripe PaymentSheet for monthly subscriptions with explicit recurring consent and cancellation of renewal.
- Authenticated `levav-billing` Edge Function. Amounts are checked server-side; an open membership is reused to prevent duplicate subscriptions.
- `levav-webhook` verifies the raw-body Stripe signature, mode, invoice, payment, customer, amount, and charge before recording enrollment. Duplicate events are idempotent. Actual charge balance-transaction fees and availability dates are stored.
- Each paid invoice enrolls the member for the next calendar month, based on the invoice issue date in the member's timezone. Renewals occur monthly on the Stripe subscription schedule. Payments confirmed after the eligible month begins are held for review rather than silently enrolled.
- Separate live and test memberships, enrollments, settlements, balances, and payout accounts.
- Settlement distributes the full pool minus recorded charge-processing fees, weighted by successful members' contributions, with exact cent rounding. This may return less than principal when few people forfeit. Fees billed separately by Stripe, including any Billing or Connect fees, require separate reconciliation and are not yet deducted by this calculation.
- Daily 15:00 UTC database job attempts settlement of completed months. It waits for approved photos and reconciled, available funds. Failures are recorded in `settlement_attempts`.
- Connect hosted recipient onboarding and transfers to verified payout accounts. Atomic wallet reservations prevent overspending; a retry reuses the same reservation and Stripe idempotency key. Uncertain requests older than 23 hours require manual reconciliation, not a second transfer.
- Donations use administrator-approved `donation_recipients` only. No organizations have been added. Free-form demo causes are never live recipients.
- Refunds/disputes put invoice funds into review and pause withdrawals while unresolved. Reversed transfers also require review; no automatic double-credit or re-transfer is attempted.

## Current deployment

The migration and both functions are deployed to the existing Supabase project. The sandbox webhook is registered and its signing secret is stored in Supabase. Current client and server keys are TEST keys; they cannot charge real money. The earlier standalone test-checkout endpoint remains for backward compatibility but is no longer the app's membership flow.

The owner reported Stripe's approval of this business model by phone on September 12, 2026. No further written-confirmation gate is imposed by the application.

## Live activation

1. Store `STRIPE_LIVE_SECRET_KEY` in Supabase Secrets. The existing `sk_test_` key cannot be reused as a live key.
2. In the live Stripe account, register a webhook endpoint at `https://qpaiaywpgmusmydivuoq.supabase.co/functions/v1/levav-webhook`, using API version `2025-06-30.basil`. Subscribe to `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, and `transfer.reversed`. Store its signing secret as `STRIPE_LIVE_WEBHOOK_SECRET` in Supabase.
3. Set the app's `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the matching `pk_live_` key and restart/rebuild. Never put either secret in an Expo public variable or Git.
4. Complete the live Connect agreement/configuration in Stripe if using the implemented Connect payout path. Recipients must complete their own identity and bank onboarding before withdrawing. A transfer to a connected Stripe account is not confirmation of arrival at its bank.
5. Build and install the native app with Stripe support (`npm run build:ios`). Native checkout and device redirect behavior still require device testing.

## Operational requirements

Photo review currently requires an administrator to set `checkins.review_status`; no automatic authenticity review or admin review UI is implemented. The schedule records a blocker if a month has pending photos. A month with no finishers stays unsettled pending a rollover/refund decision. Holiday exemptions beyond Saturday are not yet implemented.

Administrators must resolve late payments, refunds, disputes, reversed or ambiguous transfers, and separately invoiced fees. Reservation failures intentionally keep money reserved until Stripe's outcome is reconciled; never release a reservation just because a network call timed out. Change subscription amounts by canceling the existing membership and waiting for its end; immediate mid-cycle changes are not supported.

## Verification

A disposable sandbox user completed a Stripe subscription payment. Tests verified authenticated access, amount enforcement, subscription reuse, signed webhook enrollment, recorded nonzero processing fees, cancellation, and test/live separation. Fixtures were cleaned up. `tests/billing.sql` uses rollback-only fixtures to check duplicate invoice handling, net-pool rounding, repeat settlement, withdrawal reservation, insufficient funds and service-only permissions. These checks do not prove a real bank payout or native-device checkout.

Official references: [mobile subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=mobile&platform=react-native), [Connect transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [webhooks](https://docs.stripe.com/webhooks).
