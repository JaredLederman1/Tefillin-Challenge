# Levav

A native Expo app for a community centered on daily tefillin practice, with a black-and-blue design, photo check-ins, streaks, calendar, and a proposed monthly contribution pool.

## Run the app

```sh
npm ci
cp .env.example .env
# Fill in your public Supabase and Stripe test keys in .env.
npx expo start --dev-client
```

Native modules, including Stripe, require a compatible development build. Create an iOS development build with `npm run build:ios`; Apple Developer credentials and device provisioning are required. The existing Expo project and native application identifiers are retained, while the display name is Levav.

## Checks

```sh
npm run typecheck
npm test
```

## Backend and payment status

Supabase migrations are in `supabase/migrations`; payment endpoints are in `supabase/functions/levav-billing` and `supabase/functions/levav-webhook`. Store `STRIPE_SECRET_KEY` only in Supabase's secret store. Never put secret keys into an `EXPO_PUBLIC_` variable or commit an environment file.

Monthly subscriptions, signed webhook enrollment, fee-aware settlement and Connect withdrawal code are implemented. The current deployment uses test keys, with test funds isolated from real funds. Live activation requires live keys, a live webhook and completed payout configuration. Photo review and exception handling remain administrative tasks. See [payment plan](docs/payments.md) for settlement behavior and remaining decisions.

## Website

The minimal public landing page lives in `website/`. Its deployed copy is on the `gh-pages` branch, served at https://jaredlederman1.github.io/Tefillin-Challenge/. Updating `main` backs up the latest source; changes to the live website must also be published to `gh-pages`.

## Repository layout

- `App.tsx`, `src/`: native application and shared logic
- `assets/`, `scripts/`: branding assets and generators
- `supabase/`: database migrations and Edge Functions
- `tests/`: calculation and transactional database checks
- `website/`: public landing page
- `docs/`: branding and payment implementation notes
