-- Optional starter catalogue for a new SSBS project. Run once after supabase-schema.sql.
insert into public.branches (name, description) values
  ('Bhavnagar', 'Main operations & fulfilment'),
  ('Rajkot', 'Professional centre'),
  ('Godhra', 'Professional centre')
on conflict (name) do nothing;

insert into public.products (id, name, kind, type, price, image_url) values
  ('10000000-0000-4000-8000-000000000001', 'Gloss Repair Anti Hair Fall Shampoo', 'hair', 'Hair care · 200 ml', 699, 'assets/products/gloss-repair-shampoo.jpg'),
  ('10000000-0000-4000-8000-000000000002', 'Gloss Repair Hair Spray', 'hair', 'Hair care · 100 ml', 749, 'assets/products/gloss-repair-hair-spray.jpg'),
  ('10000000-0000-4000-8000-000000000003', 'Day Cream SPF 50 PA++', 'skin', 'Skin care', 899, 'assets/products/day-cream.jpg'),
  ('10000000-0000-4000-8000-000000000004', 'Aqua Touch Water Based Moisturizer', 'skin', 'Skin care', 799, 'assets/products/aqua-touch-moisturizer.jpg')
on conflict (id) do update set
  name=excluded.name, kind=excluded.kind, type=excluded.type, price=excluded.price,
  image_url=excluded.image_url, active=true;
