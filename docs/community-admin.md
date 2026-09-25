# Community admin

Apply `supabase/migrations/202609140003_community_admin_challenge.sql` and `supabase/migrations/202609140004_cornell_admin_demo.sql` before using the Community admin area. The account whose private profile phone is `7816313110` receives the Chabad at Cornell admin role. Role assignment is not exposed in the app.

To provision another admin, a database administrator inserts that account's authenticated user ID and the community ID into `public.community_admins`. Community admins can set a 1–365 day streak target, see the full name and school of current members, review their wrap dates, and open photos for those dates. Access to private wrap photos is checked against current community membership at request time. Leaving a community immediately removes that member from its admin roster and photo access.

The My Community area shows “View member roster” only for accounts returned by `my_admin_communities()`. Admins cannot edit a member's wraps or profile from this area.

Temporary member fixtures must be created only in a local development seed and must never be added to production migrations or identity tables.
