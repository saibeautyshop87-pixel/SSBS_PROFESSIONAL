/* This key is intentionally the Supabase anon/public key. Never add a service_role or secret key here. */
window.SSBS_SUPABASE_URL = 'https://jatgrsfwnisfiqndwuho.supabase.co';
window.SSBS_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdGdyc2Z3bmlzZmlxbmR3dWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MjM1OTYsImV4cCI6MjEwMTM5OTU5Nn0.HLnkZQZ5ON9sHrwGFKB55BTRfD-MZVEcbzUnKx4HciQ';
window.ssbsSupabase = window.supabase?.createClient(window.SSBS_SUPABASE_URL, window.SSBS_SUPABASE_KEY);
