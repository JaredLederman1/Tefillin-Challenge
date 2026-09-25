begin;

update public.donation_causes
set name='United Hatzalah'
where name='Friends of the IDF';

commit;
