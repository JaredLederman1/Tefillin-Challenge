# Ratzon iOS 1.0.2 (23)

Production EAS build completed successfully on October 6, 2026:
https://expo.dev/accounts/jaredlederman/projects/tefillin-challenge/builds/a58f43bc-e5aa-4ca0-a3a2-e540e19e4c75

Implementation review:
https://github.com/JaredLederman1/Tefillin-Challenge/pull/1

Membership provides ongoing digital access. Personal wallets, challenge earnings, money redistribution, charity allocation from personal balances, and tefillin purchasing/goals are retired. Company-funded charity voting and confirmed donation history replace those features. Ratzon commits to donating 100% of positive monthly net subscription profits under the published policy; there is no fixed donation per subscriber. Current App Store US price remains $2.29/month and StoreKit supplies the localized price.

Apple's one-time name is captured and recovered; Apple users are not required to repeat name/email. Production's existing gender-field removal is preserved. Nonowners receive campus/local Chabad guidance. Actual StoreKit pricing, restoration, subscription management, privacy policy, standard Apple EULA, and service terms are available in the purchase flow.

## Deployment and verification

- All three October migrations applied to production. Missing historical RPCs and a missing disabled legacy column were handled without resetting migration history.
- Deployed ratzon-billing, apple-notifications, and dev-delete-account.
- October vote initialized with Leket Israel, United Hatzalah, and American Friends of Magen David Adom. Future slates rotate monthly; computed results finalize on refresh or the existing daily cron hook.
- Public terms, privacy, and support pages are live through GitHub Pages. App Store Connect membership/group names, English localizations, description, promotional text, legal/support URLs, and review notes were updated. Price, screenshots, version/build association, and submission state were not changed.
- TypeScript and 48 unit tests pass. Full migration-chain and subscription/voting SQL scenarios pass using PGlite. Production SQL lint reports no errors. Rollback-only Apple onboarding tests pass on the live schema. iOS production Metro/Hermes export succeeds. GitHub application and database checks pass.

## Remaining before App Review

The subscription still reports MISSING_METADATA because no current App Review screenshot is attached. Capture the actual membership screen from the signed app with StoreKit's real price, attach it to the subscription, and submit the product with the chosen build. Verify Apple sign-in, purchase, restoration, cancellation/expiry, and deletion on a device. The new build is ready in Expo; it has not been uploaded to TestFlight or submitted to App Review by this task. See app-store-review.md and app-store-metadata.json for prepared metadata and reviewer notes.

Company donations still require actual revenue reconciliation and payment by the operator. Confirmation reports must reflect real fulfilled donations. Existing financial commitments remain historical obligations and must be reconciled separately; they have not been converted into company revenue.
