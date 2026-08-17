-- SSBS Professional: run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), name text not null, kind text not null check(kind in ('hair','skin')),
  type text not null, price integer not null check(price >= 0), image_url text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text not null, active boolean not null default true
);
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null, code text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(), name text not null, rating smallint not null check(rating between 1 and 5), text text not null,
  approved boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique default ('SSBS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  customer_name text not null, phone text not null, email text, address text not null, pincode text not null, payment_method text not null,
  items jsonb not null, total integer not null check(total >= 0), branch_id uuid references public.branches(id), status text not null default 'confirmed',
  courier text, awb text, tracking_url text, created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admins where user_id=auth.uid());
$$;

alter table public.admins enable row level security;
alter table public.products enable row level security;
alter table public.branches enable row level security;
alter table public.offers enable row level security;
alter table public.reviews enable row level security;
alter table public.orders enable row level security;

create policy "admin self read" on public.admins for select to authenticated using (user_id=auth.uid());
create policy "public product read" on public.products for select using (active=true);
create policy "public branch read" on public.branches for select using (active=true);
create policy "public offer read" on public.offers for select using (active=true);
create policy "public approved review read" on public.reviews for select using (approved=true);
create policy "public review submission" on public.reviews for insert with check (char_length(name) between 2 and 80 and char_length(text) between 5 and 1000);

create policy "admin product management" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin branch management" on public.branches for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin offer management" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin review management" on public.reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin order management" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Add approved administrators with a separate audited SQL statement, for example:
-- insert into public.admins (user_id) values ('PASTE-ADMIN-USER-UUID-HERE');

-- Prevent all direct order reads/writes by anonymous users. Orders will be created via a secured Edge Function next.
revoke all on public.orders from anon;
