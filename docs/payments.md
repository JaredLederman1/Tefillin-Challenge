# Levav payments

## Implemented

- Native Stripe PaymentSheet for monthly subscriptions with explicit recurring consent and cancellation of renewal.
- Authenticated `levav-billing` Edge Function. Amounts are checked server-side; an open membership is reused to prevent duplicate subscriptions.
- `levav-webhook` verifies the raw-body Stripe signature, mode, invoice, payment, customer, amount, and charge before recording enrollment. Duplicate events are idempotent. Actual charge balance-transaction fees and availability dates are stored.
- Each paid invoice enrolls the member for the next calendar month, based on the invoice issue date in the member's timezone. Renewals occur monthly on the Stripe subscription schedule. Payments confirmed after the eligible month begins are held for review rather than silently enrolled.
- Separate live and test memberships, enrollments, settlements, balances, and donation requests.
- Settlement distributes the full pool minus recorded charge-processing fees, weighted by successful members' contributions, with exact cent rounding. This may return less than principal when few people forfeit. Fees billed separately by Stripe, including any Billing or Connect fees, require separate reconciliation and are not yet deducted by this calculation.
- Daily 15:00 UTC database job attempts settlement of completed months. It waits for approved photos and reconciled, available funds. Failures are recorded in `settlement_attempts`.
- Full-balance donation requests use administrator-approved `donation_causes`. The balance is debited atomically and the request retains the cause name and amount. Repeating the same request is idempotent; live/test funds stay separate. Users can see pending, fulfilled, and canceled requests.
- Levav fulfills donations manually outside Stripe. Fulfillment requires a reference; cancellation restores the balance exactly once. No Connect onboarding or payout action is available, including to older app clients. Historical payout data is retained for reconciliation.
- Refunds/disputes put invoice funds into review and pause new donations while unresolved. Previously pending payouts also block donations until reconciled.

## Current deployment

The migration and both functions are deployed to the existing Supabase project. The sandbox webhook is registered and its signing secret is stored in Supabase. Live client and server keys and the live webhook signing secret are configured. A full live checkout has not yet been verified. The earlier standalone test-checkout endpoint remains for backward compatibility but is no longer the app's membership flow.

The owner reported Stripe's approval of this business model by phone on September 12, 2026. No further written-confirmation gate is imposed by the application.

## Live activation

1. Store `STRIPE_LIVE_SECRET_KEY` in Supabase Secrets. The existing `sk_test_` key cannot be reused as a live key.
2. In the live Stripe account, register a webhook endpoint at `https://qpaiaywpgmusmydivuoq.supabase.co/functions/v1/levav-webhook`, using API version `2025-06-30.basil`. Subscribe to `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, and `transfer.reversed`. Store its signing secret as `STRIPE_LIVE_WEBHOOK_SECRET` in Supabase.
3. Set the app's `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the matching `pk_live_` key and restart/rebuild. Never put either secret in an Expo public variable or Git.
4. Configure at least one approved donation cause using the instructions below. Connect is no longer part of the donation flow.
5. Build and install the native app with Stripe support (`npm run build:ios`). Native checkout and device redirect behavior still require device testing.

## Operational requirements

Photo review currently requires an administrator to set `checkins.review_status`; no automatic authenticity review or admin review UI is implemented. The schedule records a blocker if a month has pending photos. A month with no finishers stays unsettled pending a rollover/refund decision. Holiday exemptions beyond Saturday are not yet implemented.

Administrators must resolve late payments, refunds, disputes, reversed or ambiguous transfers, and separately invoiced fees. Reservation failures intentionally keep money reserved until Stripe's outcome is reconciled; never release a reservation just because a network call timed out. Change subscription amounts by canceling the existing membership and waiting for its end; immediate mid-cycle changes are not supported.

## Verification

A disposable sandbox user completed a Stripe subscription payment. Tests verified authenticated access, amount enforcement, subscription reuse, signed webhook enrollment, recorded nonzero processing fees, cancellation, and test/live separation. Fixtures were cleaned up. `tests/billing.sql` uses rollback-only fixtures to check duplicate invoice handling, net-pool rounding, repeat settlement, withdrawal reservation, insufficient funds and service-only permissions. These checks do not prove a real bank payout or native-device checkout.

Official references: [mobile subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=mobile&platform=react-native), [Connect transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [webhooks](https://docs.stripe.com/webhooks).

## Donation operations

Use Supabase SQL Editor as the owner. No separate admin application is implemented. First add the actual organization you intend to support to `donation_causes`: `name`, `livemode=true`, `enabled=true`. Set `featured_month` to the first of a month (for example `2026-10-01`) to offer it only that month, based on America/New_York time; leave null for an ongoing choice. Configure just one available cause to have it selected automatically. No real organizations are seeded without the owner's selection.

Review `donation_requests` with `status='pending'`, grouped by cause if making a batch donation. Pay the organization outside the app, then resolve each request with the corresponding receipt/reference:

```sql
select public.resolve_donation('REQUEST_UUID', 'fulfilled', 'Receipt or batch reference');
```

For a request that cannot be fulfilled, restore its balance with:

```sql
select public.resolve_donation('REQUEST_UUID', 'canceled', 'Reason for cancellation');
```

Never directly delete a request or edit its ledger debit. Use these functions so resolution is recorded and cancellations cannot credit twice. The reference appears to the member, so use a member-safe reference without private payment details. App confirmations acknowledge Levav's request/fulfillment; they are not charity-issued tax receipts.

The giving balance contains settled returned contributions plus earnings, after pool fees. Active or upcoming contributions remain committed to the challenge and are not yet spendable. A forfeited month does not credit that month's contribution; it does not subtract older accumulated rewards. A new settlement after a donation can add a new balance.

`tests/donations.sql` verifies full-balance debits, request retries, mode isolation, cross-user protection, overspending, cancellation, disabled causes, required fulfillment references, terminal states, and access restrictions using rollback-only fixtures.

## Live configuration — September 13, 2026

Friends of the IDF is enabled as the first live donation cause, with no expiration month. Live webhook `we_1UFCw2Cd2omq8A93gSLZ9giu` is active at the Supabase endpoint. Its signing secret is stored only in Supabase as `STRIPE_LIVE_WEBHOOK_SECRET`. The dashboard offered API version `2026-08-26.dahlia`; the handler retrieves payment and subscription objects using its own pinned API version. Selected events are invoice.payment_succeeded, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, charge.refunded, charge.dispute.created, and charge.dispute.closed. No transfer events are needed for the retired payout flow. An unsigned request returned HTTP 400 Invalid signature. This verifies endpoint reachability and signature enforcement, not successful live payment delivery.
