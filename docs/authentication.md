# Authentication

The welcome screen offers Get Started and Log In. Both offer native Apple authentication or email/password. Apple uses `expo-apple-authentication` and Supabase `signInWithIdToken` with a hashed nonce sent to Apple and the original nonce sent to Supabase.

On September 13, 2026, enabled the Apple provider in the production Supabase project `qpaiaywpgmusmydivuoq`, with client ID `com.jaredlederman.tefillinchallenge`. The dashboard confirmed Apple Enabled. This resolves the configuration behind the provider-not-enabled error; a successful device signup still needs a retry by the user.

This is native ID-token authentication. No OAuth secret was added, and web Apple OAuth is not implemented. Email confirmation remains enabled. No other provider or signup policy was changed.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-apple

## Signup profile

After Apple or email authentication, members without completed onboarding see five separate pages: full name, optional university autocomplete (custom schools accepted), optional birthday, Ashkenazi/Sephardic, and religiosity 1–5. Each page has a progress indicator and back navigation. Finish calls `complete_onboarding`; failures keep the form for retry. Existing accounts complete this once too.

`member_onboarding` stores these details privately, with owner-only read access and writes through an authenticated RPC. Only the first name is copied into the public community profile. Existing account timezones are preserved. These preferences do not alter holiday rules: Chol Hamoed is optional for everyone, preserving streaks regardless of custom.

The welcome screen opens compact Apple/email option sheets without headings or a sign-up/login switch inside the sheet. Tapping the backdrop dismisses the sheet with a downward animation. Opening slides it up over 240 ms and closing takes 180 ms; reduced-motion preferences disable the transition. Email forms retain their back control, inputs, and submit button.

Signup headings are centered and use title case (for example, Full Name). Continue and Skip sit directly after each step’s fields inside the scrollable content, rather than in a footer that follows keyboard movement.

Birthday uses month/day/year scroll wheels with no keyboard or new native dependency. Continue saves the displayed date; Skip leaves birthday empty. Month and year changes clamp the day to a valid, non-future date.

Finish immediately presents a white welcome overlay while saving the profile. The Ratzon animation completes, “Welcome to Ratzon” remains briefly visible, then the white welcome screen fades out to reveal Today. A save failure dismisses the overlay and preserves the signup form for retry. Reduced motion uses a static logo and instant reveal after the welcome pause.

## Temporary developer account deletion

You includes Delete account (dev), followed by an explicit confirmation. The `dev-delete-account` Edge Function verifies the bearer token and derives the user ID from it; it never accepts a target user ID. It removes that user's check-in files through the Storage API, then deletes the auth user; profile, check-ins, and onboarding cascade. Accounts with payment records are refused so subscriptions and financial history are not orphaned. Success clears the local session and returns to welcome for fresh signup.

Deployed to the original production project `qpaiaywpgmusmydivuoq` with explicit user approval on September 13, 2026. Legacy gateway JWT verification is off; the handler verifies each bearer token with `auth.getUser`. Remove the button, confirmation sheet, handler, Edge Function deployment, and config entry when dev testing ends.

Birthday wheels initialize to the same month/day thirteen years before today (February 29 clamps to February 28 in a non-leap target year). Native scroll-driven highlighting avoids per-frame form updates; selections commit after the wheel settles, and Continue waits for scrolling to stop.

## Tefillin ownership onboarding — September 13, 2026

Migration 202609130005_tefillin_onboarding is deployed to the original Ratzon Supabase project. New clients call complete_onboarding_v2: Full Name → School → Birthday → Tradition → Do You Own Tefillin? → (No only) Can You Borrow a Pair? Religiosity is no longer collected; old records and the legacy RPC remain compatible.

Full name, school, birthday, tradition, ownership and borrowing source remain in the owner-readable member_onboarding table. Only the first name is public in profiles. The You tab reads the private record and computes age locally from the birthday and current account date; skipped school/birthday fields are omitted. set_tefillin_access lets members change ownership/borrowing without changing other profile fields.

Non-owners see a $350 estimated tefillin goal based solely on their available settled balance, with campus borrowing and subsidy links. No supplier partnership, approved subsidy, order, shipment or redemption is implied. Redemption needs final pricing and fulfillment setup before activation. Owners do not see the goal; existing accounts with unknown ownership can set it under You.

Validation: tests/tefillin-profile.test.ts covers branching, age boundaries and goal math; tests/tefillin-onboarding.sql passed against the original database with rollback-only fixtures, covering persistence, optional values, idempotency, ownership updates, validation, RLS and authentication.
