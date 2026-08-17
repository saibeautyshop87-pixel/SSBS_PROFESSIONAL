-- DANGER: One-time cleanup. Deletes every return request and every order.
-- Products, offers, branches, reviews and admins are not changed.
begin;

delete from public.return_requests;
delete from public.orders;
alter sequence public.ssbs_order_number_seq restart with 1;

commit;

-- Verification: both counts should be 0. The next order will be SSBS01.
select
  (select count(*) from public.orders) as orders_remaining,
  (select count(*) from public.return_requests) as returns_remaining;
