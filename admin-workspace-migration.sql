-- SSBS admin workspace and manual UPI support.
-- Safe to run more than once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

-- Inventory fields used by the product workspace. Existing products are kept
-- available with a neutral zero balance until their real stock is entered.
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists stock_quantity integer not null default 0;
alter table public.products add column if not exists low_stock_threshold integer not null default 5;
alter table public.products add column if not exists updated_at timestamptz not null default now();

update public.products
set stock_quantity = greatest(coalesce(stock_quantity, 0), 0),
    low_stock_threshold = greatest(coalesce(low_stock_threshold, 5), 0),
    updated_at = coalesce(updated_at, created_at, now());

alter table public.products drop constraint if exists products_stock_quantity_check;
alter table public.products add constraint products_stock_quantity_check check (stock_quantity >= 0);
alter table public.products drop constraint if exists products_low_stock_threshold_check;
alter table public.products add constraint products_low_stock_threshold_check check (low_stock_threshold >= 0);
alter table public.products drop constraint if exists products_sku_check;
alter table public.products add constraint products_sku_check check (sku is null or char_length(btrim(sku)) between 1 and 80);

create unique index if not exists products_sku_unique
  on public.products (upper(btrim(sku)))
  where sku is not null and btrim(sku) <> '';
create index if not exists products_inventory_attention_idx
  on public.products (active, stock_quantity, low_stock_threshold);

-- Promotion scheduling and moderation states used by the marketing workspace.
alter table public.offers add column if not exists discount_percent smallint;
alter table public.offers add column if not exists minimum_order integer not null default 0;
alter table public.offers add column if not exists minimum_quantity integer not null default 1;
alter table public.offers add column if not exists first_order_only boolean not null default false;
alter table public.offers add column if not exists expires_at date;
alter table public.offers add column if not exists banner_text text;
alter table public.offers add column if not exists starts_at date;
alter table public.offers add column if not exists updated_at timestamptz not null default now();
alter table public.offers drop constraint if exists offers_discount_percent_check;
alter table public.offers add constraint offers_discount_percent_check
  check (discount_percent is null or discount_percent between 1 and 90);
alter table public.offers drop constraint if exists offers_minimum_order_check;
alter table public.offers add constraint offers_minimum_order_check check (minimum_order >= 0);
alter table public.offers drop constraint if exists offers_minimum_quantity_check;
alter table public.offers add constraint offers_minimum_quantity_check check (minimum_quantity between 1 and 20);
alter table public.offers drop constraint if exists offers_schedule_check;
alter table public.offers add constraint offers_schedule_check
  check (starts_at is null or expires_at is null or starts_at <= expires_at);
create unique index if not exists offers_code_unique on public.offers (upper(code));
create index if not exists offers_schedule_idx on public.offers (active, starts_at, expires_at);

alter table public.reviews add column if not exists image_url text;
alter table public.reviews add column if not exists review_status text not null default 'pending';
alter table public.reviews add column if not exists moderated_at timestamptz;
alter table public.reviews add column if not exists updated_at timestamptz not null default now();
update public.reviews
set review_status = case when approved then 'published' else coalesce(nullif(review_status, ''), 'pending') end;
alter table public.reviews drop constraint if exists reviews_review_status_check;
alter table public.reviews add constraint reviews_review_status_check
  check (review_status in ('pending', 'published', 'hidden'));
create index if not exists reviews_moderation_queue_idx on public.reviews (review_status, created_at desc);

alter table public.upcoming_products add column if not exists updated_at timestamptz not null default now();
alter table public.branches add column if not exists updated_at timestamptz not null default now();

-- Manual UPI is intentionally a verification workflow rather than an automatic
-- refund/payment claim. References may contain the customer's UTR or an internal
-- payment confirmation reference.
alter table public.orders add column if not exists payment_status text not null default 'awaiting_upi';
alter table public.orders add column if not exists subtotal integer;
alter table public.orders add column if not exists discount integer not null default 0;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists admin_note text;
alter table public.orders add column if not exists inventory_committed boolean not null default false;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
update public.orders
set inventory_committed = true
where status in ('delivered', 'rto') and inventory_committed = false;
update public.orders
set subtotal = coalesce(subtotal, total), discount = greatest(coalesce(discount, 0), 0);
alter table public.orders drop constraint if exists orders_subtotal_check;
alter table public.orders add constraint orders_subtotal_check check (subtotal is null or subtotal >= 0);
alter table public.orders drop constraint if exists orders_discount_check;
alter table public.orders add constraint orders_discount_check check (discount >= 0);

update public.orders
set payment_status = case
      when payment_status in ('awaiting_upi', 'verified', 'failed', 'refunded') then payment_status
      else 'awaiting_upi'
    end,
    updated_at = coalesce(updated_at, created_at, now());

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('awaiting_upi', 'verified', 'failed', 'refunded'));
alter table public.orders drop constraint if exists orders_verified_payment_reference_check;
alter table public.orders add constraint orders_verified_payment_reference_check
  check (payment_status not in ('verified', 'refunded') or nullif(btrim(payment_reference), '') is not null);
create index if not exists orders_payment_queue_idx
  on public.orders (payment_status, created_at desc);
create index if not exists orders_inventory_queue_idx
  on public.orders (inventory_committed, status, created_at desc);

-- Refund bookkeeping. Amounts use the same smallest whole-currency unit as the
-- existing order totals (the current SSBS application stores whole rupees).
alter table public.return_requests add column if not exists refund_amount integer;
alter table public.return_requests add column if not exists refund_reference text;
alter table public.return_requests add column if not exists admin_notes text;

update public.return_requests set refund_amount = greatest(refund_amount, 0) where refund_amount < 0;
alter table public.return_requests drop constraint if exists return_requests_refund_amount_check;
alter table public.return_requests add constraint return_requests_refund_amount_check
  check (refund_amount is null or refund_amount >= 0);
alter table public.return_requests drop constraint if exists return_requests_completed_refund_details_check;
alter table public.return_requests add constraint return_requests_completed_refund_details_check
  check (
    status <> 'refund completed' or
    (coalesce(refund_amount, 0) > 0 and nullif(btrim(refund_reference), '') is not null)
  ) not valid;
create index if not exists return_requests_status_created_idx
  on public.return_requests (status, created_at desc);

-- Append-only audit stream for actions performed in the admin workspace.
create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_activity add column if not exists admin_user_id uuid default auth.uid() references auth.users(id) on delete set null;
alter table public.admin_activity add column if not exists action text;
alter table public.admin_activity add column if not exists entity_type text;
alter table public.admin_activity add column if not exists entity_id text;
alter table public.admin_activity add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.admin_activity add column if not exists created_at timestamptz not null default now();

alter table public.admin_activity drop constraint if exists admin_activity_action_check;
alter table public.admin_activity add constraint admin_activity_action_check
  check (char_length(btrim(action)) between 1 and 100);
alter table public.admin_activity drop constraint if exists admin_activity_entity_type_check;
alter table public.admin_activity add constraint admin_activity_entity_type_check
  check (char_length(btrim(entity_type)) between 1 and 80);
alter table public.admin_activity drop constraint if exists admin_activity_details_check;
alter table public.admin_activity add constraint admin_activity_details_check
  check (jsonb_typeof(details) = 'object');

create index if not exists admin_activity_created_idx on public.admin_activity (created_at desc);
create index if not exists admin_activity_entity_idx on public.admin_activity (entity_type, entity_id, created_at desc);

alter table public.admin_activity enable row level security;
drop policy if exists "admin activity read" on public.admin_activity;
create policy "admin activity read" on public.admin_activity
  for select to authenticated using (public.is_admin());
drop policy if exists "admin activity insert" on public.admin_activity;
create policy "admin activity insert" on public.admin_activity
  for insert to authenticated
  with check (public.is_admin() and (admin_user_id is null or admin_user_id = auth.uid()));

revoke all on public.admin_activity from anon;
revoke update, delete, truncate on public.admin_activity from authenticated;
grant select, insert on public.admin_activity to authenticated;

-- Commit inventory exactly once when a verified order enters fulfilment. The
-- function locks the order and all decrements share one transaction, so a
-- shortage rolls every product change back.
create or replace function public.commit_order_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  item jsonb;
  product_id uuid;
  requested_quantity integer;
  product_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if current_order.inventory_committed then
    return jsonb_build_object('committed', true, 'alreadyCommitted', true);
  end if;
  if current_order.payment_status <> 'verified' then
    raise exception 'Verify the manual UPI payment before committing inventory.';
  end if;

  for item in select value from jsonb_array_elements(current_order.items)
  loop
    product_id := (item->>'id')::uuid;
    requested_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));
    product_name := null;
    update public.products
      set stock_quantity = stock_quantity - requested_quantity
      where id = product_id and stock_quantity >= requested_quantity
      returning name into product_name;
    if product_name is null then
      raise exception 'Insufficient stock for %.', coalesce(item->>'name', 'an order item');
    end if;
  end loop;

  update public.orders set inventory_committed = true where id = p_order_id;
  return jsonb_build_object('committed', true, 'alreadyCommitted', false);
end;
$$;

revoke all on function public.commit_order_inventory(uuid) from public;
grant execute on function public.commit_order_inventory(uuid) to authenticated;

-- Keep administrative edits timestamped without requiring every client to
-- remember to send updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists return_requests_set_updated_at on public.return_requests;
create trigger return_requests_set_updated_at
  before update on public.return_requests
  for each row execute function public.set_updated_at();

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

drop trigger if exists upcoming_products_set_updated_at on public.upcoming_products;
create trigger upcoming_products_set_updated_at
  before update on public.upcoming_products
  for each row execute function public.set_updated_at();

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();
