-- Run once in Supabase Dashboard > SQL Editor.
-- This grants SSBS admin access only to the approved authentication user.
insert into public.admins (user_id)
values ('b03ad32b-3f16-4cc8-942f-f36c06675ba7')
on conflict (user_id) do nothing;
