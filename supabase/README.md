# Deploy

1. SQL Editor: jalankan migrations/003_revoke_sessions.sql
2. supabase login && supabase link --project-ref <ref>
3. supabase secrets set SITE_URL=https://domain-kamu
   (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY otomatis, JANGAN di-set manual)
4. supabase functions deploy admin-create admin-set-password account-set-active admin-delete send-reset-link
   (verify_jwt default true: biarkan)

Contoh panggil dari browser (login sebagai super admin):
  const { data } = await supabase.functions.invoke('admin-create',
    { body: { email, full_name } })
