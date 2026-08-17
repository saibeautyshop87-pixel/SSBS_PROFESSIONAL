-- Run this in Supabase Dashboard > SQL Editor for the same Supabase project
-- used by app.js. It allows browser visitors to submit pending reviews,
-- while only approved reviews are visible publicly.

alter table public.reviews enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on public.reviews to anon, authenticated;

drop policy if exists "public review submission" on public.reviews;
create policy "public review submission"
on public.reviews
for insert
to public
with check (true);

drop policy if exists "public approved review read" on public.reviews;
create policy "public approved review read"
on public.reviews
for select
to public
using (approved = true);

-- Quick verification inside SQL Editor:
-- This should return the policy named "public review submission".
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'reviews';
