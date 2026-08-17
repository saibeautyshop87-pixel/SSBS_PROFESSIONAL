# SSBS Professional — Supabase setup

Create a Supabase project, then run this SQL in its SQL Editor:

```sql
create table products (
  id text primary key,
  name text not null,
  kind text check (kind in ('hair','skin')) not null,
  type text not null,
  price integer not null,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);
create table offers (
  id bigint generated always as identity primary key,
  title text not null, description text not null, code text not null,
  active boolean default true, created_at timestamptz default now()
);
create table reviews (
  id bigint generated always as identity primary key,
  name text not null, rating integer check (rating between 1 and 5),
  text text not null, approved boolean default false,
  created_at timestamptz default now()
);
create table orders (
  id text primary key,
  customer_name text, phone text, items jsonb not null,
  total integer not null, status text default 'confirmed',
  branch text default 'Bhavnagar', created_at timestamptz default now()
);

alter table products enable row level security;
alter table offers enable row level security;
alter table reviews enable row level security;
alter table orders enable row level security;
create policy "Public can read active products" on products for select using (active = true);
create policy "Public can read active offers" on offers for select using (active = true);
create policy "Public can read approved reviews" on reviews for select using (approved = true);
```

For production, authenticate administrators with Supabase Auth and create server-side/admin-only policies for writing products, offers, reviews, and orders. Never put a Supabase `service_role` key in this website.

## Required security before launch

Do not publish the current local-browser demo as an admin system. Use Supabase Auth with individual staff accounts, require MFA for each admin, and use a server/Edge Function to perform every admin write. That server function must check the authenticated user's `admin` role before changing a product, offer, branch, order or review. Keep the `orders` table unreadable to the public; customers should track by a one-time signed tracking token rather than a public order number. Store product photos in a **private** Supabase Storage bucket and return signed URLs only where needed.

Then replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top of `app.js`, and replace the WhatsApp number `919999999999` with the business number (including India country code, no `+`).
