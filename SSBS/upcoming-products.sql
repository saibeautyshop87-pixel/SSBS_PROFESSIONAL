-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.upcoming_products (
  id uuid primary key default gen_random_uuid(), name text not null,
  kind text not null check (kind in ('hair','skin')), description text not null,
  image_url text, launch_date date, active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.upcoming_products enable row level security;
drop policy if exists "public upcoming product read" on public.upcoming_products;
create policy "public upcoming product read" on public.upcoming_products for select using (active=true);
drop policy if exists "admin upcoming product management" on public.upcoming_products;
create policy "admin upcoming product management" on public.upcoming_products for all to authenticated using (public.is_admin()) with check (public.is_admin());
