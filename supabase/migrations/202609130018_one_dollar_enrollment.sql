begin;

-- Membership checkout already accepts $1; enrollment must accept the same
-- amount or record_paid_invoice rolls back the invoice and wallet credit.
alter table public.enrollments drop constraint enrollments_contribution_cents_check;
alter table public.enrollments add constraint enrollments_contribution_cents_check
  check (contribution_cents between 100 and 100000);

commit;
