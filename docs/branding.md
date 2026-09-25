# Ratzon

Ratzon is the app and customer-facing brand. Use it in UI, checkout, support copy, and future artwork. The supplied blue R/tefillin artwork (`assets/media/logo.png`, originally `Logo.png`) is the global logo. The original media package is preserved in `assets/media/`; trimmed variants only remove transparent margins. `App Cover.png` supplies the home-screen icon.

The primary server functions are `ratzon-billing` and `ratzon-webhook`. Legacy function routes, URL schemes, Stripe metadata/idempotency keys and historical migration identifiers are retained solely for compatibility with existing installations, subscriptions and pending retries. They are not display names. Do not globally replace these payment identifiers: that can duplicate charges or reject existing subscriptions.

The native bundle identifiers and Expo project ID retain the installed application's identity. Native display-name and URL-scheme changes require rebuilding the app.

Deployed branding: Stripe account/public business name and card statement descriptor use Ratzon/RATZON. The live webhook points at `ratzon-webhook`; the Supabase project is named Ratzon and its daily settlement schedule is `ratzon-monthly-settlement`. GitHub Pages serves the Ratzon landing page. Existing repository and Expo slugs remain stable URLs.

## September 13 media refresh

The welcome screen and landing page use pale blue backgrounds to preserve the deep navy wordmark. The signed-in app retains dark navy surfaces and blue actions. The welcome animation holds the R at center for 650 ms, then slides it left and reveals the supplied “atzon” image over 1,250 ms. Reduce Motion displays the completed wordmark immediately. The welcome screen keeps the brand centered and shows one navy Get Started button with larger white text, plus a smaller Already have an account? Log In line with Log In underlined at the bottom. Both open a choice of Apple or email/password; the email form appears only after choosing email.

Run `node scripts/create-icons.cjs` to regenerate app icons and website media from the supplied originals. Native icon and splash changes require a new build. Publish `website/` to the existing `gh-pages` branch to update the public site, preserving `CNAME`.

The public landing page is minimal: the centered animated Ratzon logo and “Coming soon,” on the same pale-blue gradient as the app welcome screen. Published to the existing GitHub Pages branch on September 13, 2026.

## Today and signup

Today occupies the middle raised circle in the three-tab navigation (Community, Today, You). Main app headers show a bold, left-aligned page title; Today uses the full date including year. The R mark appears inside the raised center Today navigation button in place of the sun icon. Post your wrap opens the native camera with no library selection, followed by an optional comment of at most 10 words. Signup uses five light-blue pages with navy controls and a segmented progress indicator.

Today includes a short Chol Hamoed note explaining that tefillin customs differ and streaks are preserved either way. Custom wording checked against the [Orthodox Union overview](https://www.ou.org/holidays/halacha-according-to-the-sephardic-practice-chol-hamoed/).

## UI copy preference

Use concise headings directly above controls, with no subtitle or tagline beneath them. Required explanations stand alone. This applies throughout the platform and is persisted in `AGENTS.md` and `.cursor/rules/ui-copy.mdc`.

The approved brand slogan is “Live With Intention”, centered beneath the animated Ratzon logo on the app welcome screen and website. This is an explicit exception to the no-subtitle rule. The website retains Coming soon beneath the slogan.

The welcome logo uses native-driven translation and a counter-translated clipping mask rather than animating layout width/left. The completion transition waits for the Today header layout, allows two paint frames, and fades the entire white welcome screen out over 500 ms. Today’s separate page entrance is disabled for that first reveal.

The app's shared startup/completion logo animation waits for the actual visible image assets and initial layout, then begins after two paint frames with no fixed startup delay. It uses a 900 ms native ease-out transform, disables image fade-in, and memoizes its component and interpolation nodes to avoid background-update churn. Reduced-motion behavior remains static.

Wallet functions are embedded in You alongside membership status and account controls. Challenge and Wallet are no longer separate tabs. The Today calendar and You’s monthly-contribution control remain available.
