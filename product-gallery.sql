-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.product_images enable row level security;
create policy "public product gallery read" on public.product_images for select using (true);
create policy "admin product gallery management" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
