-- Run once in Supabase Dashboard > SQL Editor.
-- Adds secure percentage coupons and stores the applied saving on each order.
alter table public.offers add column if not exists discount_percent smallint check (discount_percent between 1 and 90);
alter table public.offers add column if not exists minimum_order integer not null default 0 check (minimum_order >= 0);
alter table public.offers add column if not exists minimum_quantity integer not null default 1 check (minimum_quantity between 1 and 20);
alter table public.offers add column if not exists first_order_only boolean not null default false;

alter table public.orders add column if not exists subtotal integer check (subtotal >= 0);
alter table public.orders add column if not exists discount integer not null default 0 check (discount >= 0);
alter table public.orders add column if not exists coupon_code text;

create unique index if not exists offers_code_unique on public.offers (upper(code));

insert into public.offers (id, title, description, code, discount_percent, minimum_order, minimum_quantity, first_order_only, active)
values
  ('20000000-0000-4000-8000-000000000001', 'Your first SSBS ritual', 'Enjoy 15% off your first order of premium care.', 'WELCOME15', 15, 0, 1, true, true),
  ('20000000-0000-4000-8000-000000000002', 'Care, twice over', 'Buy any two products and get 10% off your complete order.', 'RITUAL10', 10, 0, 2, false, true)
on conflict (id) do update set
  title=excluded.title, description=excluded.description, code=excluded.code,
  discount_percent=excluded.discount_percent, minimum_order=excluded.minimum_order,
  minimum_quantity=excluded.minimum_quantity, first_order_only=excluded.first_order_only, active=true;
