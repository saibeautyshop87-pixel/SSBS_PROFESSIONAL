-- Run once in Supabase Dashboard > SQL Editor.
alter table public.offers add column if not exists expires_at date;
alter table public.offers add column if not exists banner_text text;
alter table public.reviews add column if not exists image_url text;
