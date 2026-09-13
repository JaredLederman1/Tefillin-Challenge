begin;
-- Replace the named schedule atomically; the settlement function and lock remain unchanged.
select cron.unschedule(jobid) from cron.job where jobname='levav-monthly-settlement';
select cron.schedule('ratzon-monthly-settlement','0 15 * * *',$$select public.process_due_settlements();$$);
commit;
