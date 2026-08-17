-- Run once in Supabase Dashboard > SQL Editor.
-- New orders: SSBS01, SSBS02, SSBS03 ... with no upper limit.
create sequence if not exists public.ssbs_order_number_seq start with 1 increment by 1;

create or replace function public.next_ssbs_order_number()
returns text
language sql
volatile
as $$
  select 'SSBS' || lpad(nextval('public.ssbs_order_number_seq')::text, 2, '0');
$$;

alter table public.orders
  alter column order_number set default public.next_ssbs_order_number();
