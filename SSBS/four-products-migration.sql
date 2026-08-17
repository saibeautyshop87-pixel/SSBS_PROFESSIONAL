-- Run once in Supabase Dashboard > SQL Editor for an existing SSBS database.
-- Replaces the original demo catalogue with the four real SSBS products.
update public.products
set active = false
where name in (
  'Repair & Restore Shampoo',
  'Silk Finish Hair Serum',
  'Daily Glow Cleanser',
  'Intense Hydrating Mask',
  'Radiance Barrier Cream',
  'Scalp Balance Tonic'
);

insert into public.products (id, name, kind, type, price, image_url, active) values
  ('10000000-0000-4000-8000-000000000001', 'Gloss Repair Anti Hair Fall Shampoo', 'hair', 'Hair care · 200 ml', 699, 'assets/products/gloss-repair-shampoo.jpg', true),
  ('10000000-0000-4000-8000-000000000002', 'Gloss Repair Hair Spray', 'hair', 'Hair care · 100 ml', 749, 'assets/products/gloss-repair-hair-spray.jpg', true),
  ('10000000-0000-4000-8000-000000000003', 'Day Cream SPF 50 PA++', 'skin', 'Skin care', 899, 'assets/products/day-cream.jpg', true),
  ('10000000-0000-4000-8000-000000000004', 'Aqua Touch Water Based Moisturizer', 'skin', 'Skin care', 799, 'assets/products/aqua-touch-moisturizer.jpg', true)
on conflict (id) do update set
  name=excluded.name, kind=excluded.kind, type=excluded.type, price=excluded.price,
  image_url=excluded.image_url, active=true;
