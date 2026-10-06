# Subscription and company donation operations

Deploy `202610060001_subscription_charity_vote.sql` before the new mobile release and deploy the `ratzon-billing` and `apple-notifications` Edge Functions. Deploy onboarding migration separately. Migration preserves all historical invoices, enrollments, donation requests, and ledger entries. Reconcile and fulfill old member commitments separately; this migration does not turn those balances into company revenue. New App Store subscriptions never create enrollments or wallet credits.

Monthly candidates are initialized on the first authenticated vote-status request. Three enabled live donation causes rotate by month. The slate's displayed order resolves ties, including a month with no votes. Members have one final vote per month; voting closes at midnight America/New_York on the first of the next month. Subscription access is verified against Apple's subscription status API and stored with an expiry. Historical financial records do not grant access.

Operators with Supabase service-role/SQL access can configure future round rows and their candidates. Publish at least one enabled charity, set the next-month cutoff in America/New_York, and use unique positive `tie_rank` values. Do not change candidates or their ordering once the round is visible or has votes. No public client may update candidates, close rounds, alter totals, or publish receipts.

After a month ends, close the round with:

```sql
select public.close_charity_vote_round('2026-10-01'::date);
```

This determines the winner from recorded votes. It does not move money or fabricate a donation. Reconcile actual company subscription revenue and deduct App Store fees, refunds, applicable taxes and documented operating costs. Donate 100% of positive monthly net profit to the computed recipient. If positive net profit is zero, record zero and explain that outcome in the company's public report.

After making the company's donation, update only the closed round with the actual cents, fulfillment timestamp and a public HTTPS confirmation link. Do not publish private bank or donor information:

```sql
update public.charity_vote_rounds
set donation_cents = :actual_company_donation_cents,
    donated_at = :actual_fulfillment_timestamp,
    receipt_url = :public_https_receipt
where month = :closed_month and status = 'closed';
```

The app displays closed recipients as pending until fulfillment is recorded. Donation totals and confirmations are company reporting, not balances owned or redeemable by users. Ratzon remains responsible for charity due diligence, reconciliation and actual payment; the voting feature is not an automatic disbursement integration.

The existing StoreKit product identifier is retained so current subscribers can restore. App Store Connect must update the product's public name/description from contribution terminology to digital subscription access and submit the subscription with the build. Actual prices come from StoreKit; the legacy membership schema's amount columns are retained solely for compatibility, and neither represent member charitable funds nor establish a donation amount.

For executable operator commands, use `scripts/charity-operations.cjs`. Provide Supabase URL and service-role credential in the process environment; do not paste credentials into command arguments or commit them. The script supports `list`, `configure MONTH UUID...`, `close MONTH`, and `publish MONTH CENTS FULFILLED_ISO HTTPS_RECEIPT`. Backend validation restricts slate changes to future months and rejects publication before the round is closed. Commands are shown in the script header. Public clients have no permission to invoke these operator endpoints.

Database validation used PGlite's PostgreSQL engine with `tests/subscription-charity-vote.sql` as a minimal historical-schema fixture, followed by the actual migration. `scripts/validate-charity-sql.mjs` checks subscription ownership and replay handling, renewal updates, subscriber eligibility, one vote per member, early-close rejection, winner computation, published receipts, vote privacy, operator permissions, and rejection of retired money actions. Run after installing PGlite in a disposable directory:

```sh
npm install --prefix /tmp/ratzon-sql-check --no-save --package-lock=false @electric-sql/pglite
node scripts/validate-charity-sql.mjs /tmp/ratzon-sql-check/node_modules/@electric-sql/pglite/dist/index.js
```

This validates exercised PostgreSQL paths against a minimal fixture, not all historical migrations or the production dataset. Use Supabase migration dry-run and deployment checks for production compatibility.

The full local historical migration chain (including the recovered production remove-gender migration and both October migrations) also passed PGlite validation using lightweight Supabase Auth/Storage fixtures and a mocked `pg_cron` extension. The latest Apple onboarding SQL fixture and the subscription/voting assertions both pass on that schema. Reproduce with `node scripts/validate-release-sql.mjs /tmp/ratzon-sql-check/node_modules/@electric-sql/pglite/dist/index.js`. This checks real table/function/constraint compatibility; it does not execute cron scheduling or simulate external Apple/Stripe network services.
