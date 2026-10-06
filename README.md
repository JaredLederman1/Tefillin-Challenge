# Ratzon

A native Expo app for a community centered on daily tefillin practice, with a black-and-blue design, photo check-ins, streaks, calendar, and a digital-access subscription with monthly charity voting.

## Run the app

```sh
npm ci
cp .env.example .env
# Fill in your public Supabase keys in .env.
npx expo start --dev-client
```

Native modules, including StoreKit, require a compatible development build. Create an iOS development build with `npm run build:ios`; Apple Developer credentials and device provisioning are required. The existing Expo project and native application identifiers are retained, while the display name is Ratzon.

## Checks

```sh
npm run typecheck
npm test
```

## Backend and payment status

Supabase migrations are in `supabase/migrations`; payment endpoints are in `supabase/functions/ratzon-billing` and `supabase/functions/ratzon-webhook`. Store `STRIPE_SECRET_KEY` only in Supabase's secret store. Never put secret keys into an `EXPO_PUBLIC_` variable or commit an environment file.

Current iOS purchases pay for ongoing digital app access through StoreKit. Members have no purchased charitable balance, challenge earnings, or tefillin purchasing flow. Active subscribers cast one monthly charity vote; Ratzon commits its own positive monthly net profits to the selected charity. No fixed per-subscription donation is promised. Historical financial records remain for reconciliation; legacy challenge collection, settlement and donation requests must remain disabled for this release.

Apply the latest subscription/voting migration and deploy the billing and Apple notification functions before release. Configure each monthly charity slate, reconcile company proceeds and expenses, and record actual fulfilled donations through administrative tools. See [App Store release checklist](docs/app-store-review.md). Earlier payment implementation notes in [payments.md](docs/payments.md) describe the retired contribution-pool model and are historical, not instructions to enable that model.

## Website

The minimal public landing page lives in `website/`. Its deployed copy is on the `gh-pages` branch, served at https://jaredlederman1.github.io/Tefillin-Challenge/. Updating `main` backs up the latest source; changes to the live website must also be published to `gh-pages`.

## Repository layout

- `App.tsx`, `src/`: native application and shared logic
- `assets/`, `scripts/`: branding assets and generators
- `supabase/`: database migrations and Edge Functions
- `tests/`: calculation and transactional database checks
- `website/`: public landing page
- `docs/`: branding and payment implementation notes
