# Ratzon

Ratzon is the app and customer-facing brand. Use it in UI, checkout, support copy, and future artwork. The blue tefillin symbol remains the core logo.

The primary server functions are `ratzon-billing` and `ratzon-webhook`. Legacy function routes, URL schemes, Stripe metadata/idempotency keys and historical migration identifiers are retained solely for compatibility with existing installations, subscriptions and pending retries. They are not display names. Do not globally replace these payment identifiers: that can duplicate charges or reject existing subscriptions.

The native bundle identifiers and Expo project ID retain the installed application's identity. Native display-name and URL-scheme changes require rebuilding the app.

Deployed branding: Stripe account/public business name and card statement descriptor use Ratzon/RATZON. The live webhook points at `ratzon-webhook`; the Supabase project is named Ratzon and its daily settlement schedule is `ratzon-monthly-settlement`. GitHub Pages serves the Ratzon landing page. Existing repository and Expo slugs remain stable URLs.
