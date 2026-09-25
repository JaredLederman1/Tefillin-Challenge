begin;

-- `process_due_settlements` exclusively uses `settle_net_month`.  Remove the
-- superseded routine so privileged operators cannot invoke a stale settlement
-- implementation and so schema lint reflects the production path.
drop function if exists public.settle_month(date);

commit;
