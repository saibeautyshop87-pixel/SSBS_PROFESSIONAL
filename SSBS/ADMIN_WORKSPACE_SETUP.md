# SSBS Admin Workspace setup

The redesigned admin uses the existing Supabase project plus the idempotent workspace migration.

## 1. Apply the database migration

In Supabase Dashboard → SQL Editor, run the complete contents of:

`admin-workspace-migration.sql`

It adds manual-UPI verification, refund references, SKU/inventory fields, coupon scheduling, review moderation states, the admin activity log, and atomic inventory commitment. Existing delivered/RTO orders are marked as historical inventory so old orders do not reduce stock.

After the migration, enter the real stock quantity and SKU for each active product. Existing products intentionally start at stock `0`; the system does not invent inventory.

## 2. Redeploy the public order functions

From the project root:

```powershell
supabase login
supabase link --project-ref jatgrsfwnisfiqndwuho
supabase functions deploy create-order
supabase functions deploy track-order
supabase functions deploy request-return
```

`create-order` records every new checkout as `awaiting_upi`. `track-order` exposes the customer-safe payment/refund state and never returns private admin notes.

## 3. Manual UPI workflow

1. Customer places an order and contacts SSBS on WhatsApp for UPI details.
2. Admin checks the bank/UPI app, enters the real payment reference, and marks payment **Verified**.
3. Admin advances the order into preparation. Inventory is committed atomically once.
4. For a return, admin records the actual refund amount and UPI reference before selecting **Refund marked as sent**.

The website does not transfer or refund money automatically. It records verified manual actions truthfully.

## 4. Refresh the website

After publishing the changed files, open the admin in a new tab and use `Ctrl + Shift + R` once so the updated service worker and admin assets are loaded.
