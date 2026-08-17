-- Run in Supabase Dashboard > SQL Editor.
-- Adds a manual delivery charge field for admin-managed order totals.

alter table public.orders add column if not exists delivery_charge integer not null default 0;

alter table public.orders drop constraint if exists orders_delivery_charge_check;
alter table public.orders add constraint orders_delivery_charge_check
  check (delivery_charge >= 0);

