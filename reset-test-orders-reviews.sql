-- Run in Supabase Dashboard > SQL Editor when you are ready to permanently
-- remove test orders, return requests, reviews, and admin activity logs.
--
-- WARNING: This deletes data from the live database. It cannot be undone
-- unless you restore from a Supabase backup.

delete from public.return_requests;
delete from public.admin_activity;
delete from public.orders;
delete from public.reviews;

-- Optional verification counts. These should all return 0 after the delete.
select 'orders' as table_name, count(*) from public.orders
union all
select 'return_requests', count(*) from public.return_requests
union all
select 'reviews', count(*) from public.reviews
union all
select 'admin_activity', count(*) from public.admin_activity;

