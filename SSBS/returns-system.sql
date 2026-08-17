-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  order_number text not null,
  phone text not null,
  reason text not null,
  details text not null,
  status text not null default 'requested' check (status in ('requested','approved','returned','refund completed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.return_requests enable row level security;
drop policy if exists "admin return management" on public.return_requests;
create policy "admin return management" on public.return_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.return_requests from anon;

-- Safe upgrade when this file was run before Pickup Scheduled was removed.
update public.return_requests set status='approved', updated_at=now() where status='pickup scheduled';
alter table public.return_requests drop constraint if exists return_requests_status_check;
alter table public.return_requests add constraint return_requests_status_check check (status in ('requested','approved','returned','refund completed','rejected'));
