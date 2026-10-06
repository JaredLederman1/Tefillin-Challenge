# Ratzon subscription and charity-voting release

This release sells ongoing digital app access. It removes user money wallets, check-in earnings and redistribution, personal donation requests, and all tefillin purchasing. Users who do not own tefillin are directed to their nearest campus or local Chabad center. Ratzon independently donates 100% of positive monthly net subscription profits, reconciled after commissions, refunds, taxes and documented operating costs. Subscribers cast a monthly charity vote; their payments are not individual donations and have no personal cash balance.

## Required App Store Connect changes

- Retain the existing product ID `com.jaredlederman.tefillinchallenge.monthly_contribution` to preserve existing subscribers; change its customer-facing localized name to **Ratzon Membership** and description to ongoing access to check-ins, streaks, history and community features. Do not rename identifiers or create duplicate subscriptions for existing subscribers.
- Confirm its duration is one month and choose the actual supported App Store price tier. The app displays StoreKit's localized price and duration, rather than hardcoding $2.16, $2.19 or $2.29.
- Complete subscription localization, availability, tax category, review screenshot showing the paywall and legal links, and review notes. Resolve any missing metadata. Attach the subscription to the new app version and submit it with that build; uploading an Expo build does not submit the subscription product.
- Set the privacy-policy URL to `https://ratzonapp.com/privacy.html` and publish the updated page before submission.
- Add this sentence to the app description: **Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/**.
- Publish `https://ratzonapp.com/terms.html` with the service terms. Keep the standard Apple EULA as the app license, unless a custom EULA is deliberately configured in App Store Connect.
- Review App Privacy responses against actual production providers, collected identifiers, photos, subscription transactions and voting records. Verify age rating and support contact.
- Provide reviewer credentials with access to the entire app, explain how to restore a sandbox subscription, and keep backend services available.

## Website publishing

The source pages are `website/privacy.html` and `website/terms.html`; the support page is `website/support.html`. The repository's public site is served from `gh-pages` with the custom domain `ratzonapp.com`. Updating source on the main branch does not publish these changes. Publish the website contents to that branch and verify the support and legal URLs return the new documents publicly before submitting the build. Never send new subscription purchases to the retired Stripe contribution flow.

## Backend and financial transition

Apply the new subscription-access/voting migration, deploy the billing and Apple notification functions, and verify both new and existing subscription entitlements. Test expired, refunded and revoked subscriptions, restore purchases, failed verification and account conflicts. Stop legacy scheduled settlement/collection; preserve historical financial records for reconciliation. Existing subscriber payment terms and historical committed contributions require an explicit accounting transition; do not silently convert historical money into company profits.

Each calendar round closes at the start of the next month in America/New_York. A paid eligible member casts one immutable vote. Highest vote count wins; ties and zero-vote rounds use the published candidate order. Configure real eligible charity candidates and publish the order before voting. No donated total is displayed until recorded from actual reconciliation and fulfillment. Record expenses, net profit, recipient, payment reference and confirmation without inventing a $1.80-per-member value.

## Proposed review response

We replaced the contribution-pool model with a standard auto-renewable subscription for ongoing digital access to daily check-ins, streak tracking, personal history and community features. Subscribers have no monetary wallet, earnings, withdrawal rights or individual donation balance; check-in completion does not affect paid access. Separately, Ratzon donates its own positive monthly net subscription profits after reconciliation. Subscribers may cast one vote on a rotating monthly charity slate to help select the recipient of that company donation. We removed all physical tefillin purchasing, goal balances and related wallet spending. Members who do not own tefillin are directed to their nearest campus or local Chabad center. The purchase screen shows StoreKit's actual localized subscription price and period, renewal disclosures, restore purchases, and functional Privacy Policy and Terms of Use links. The subscription is included with this app-version submission. Sign in with Apple names are saved when supplied and are not requested again as a required onboarding field.

Describe this flow directly to App Review. Apple has not pre-approved this subscription and company-donation model; do not claim approval in metadata or review notes.

## Release verification

Verify fresh Apple sign-in, returning Apple sign-in with no repeated full name, optional missing name, email signup, owners and non-owners, purchase/restore, legal links, subscription management, monthly voting and tie handling on the signed iPhone/iPad build. Ensure the old wallet, earnings, charity transfer and tefillin purchase screens cannot be opened. A successful Expo build is distinct from App Store Connect upload, subscription submission, Apple approval and TestFlight installation.

Official references: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple Standard EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/), [Submit an in-app purchase](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/).
