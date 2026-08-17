# Deploy secure SSBS order functions

For the complete admin workspace and manual-UPI workflow, run `admin-workspace-migration.sql` after the base schema and existing return/upcoming tables. See `ADMIN_WORKSPACE_SETUP.md` for the full order of operations.

Install the Supabase CLI, then log in and link the project:

```powershell
supabase login
supabase link --project-ref jatgrsfwnisfiqndwuho
supabase functions deploy create-order
supabase functions deploy track-order
supabase functions deploy request-return
```

Whenever `create-order/index.ts` changes, deploy `create-order` again. Coupon totals are validated in this function so customers cannot alter discounts from the browser.

The hosted project supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not put the service-role key in the website.
