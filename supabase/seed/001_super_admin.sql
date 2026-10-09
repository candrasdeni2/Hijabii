-- 001_super_admin.sql — tugas 0.5: akun super admin PERTAMA (satu-satunya akun yang dibuat manual).
-- Langkah:
--   1. Supabase Dashboard > Authentication > Users > Add user > "Create new user".
--      Isi email pemilik brand + password kuat, centang "Auto Confirm User".
--   2. Jalankan skrip ini di SQL Editor, setelah mengganti email di bawah.
-- Profil dibuat otomatis oleh trigger handle_new_user() dengan role 'customer', lalu dinaikkan di sini.

update public.profiles
   set role = 'super_admin',
       full_name = case when full_name = '' then 'Pemilik Hijabii' else full_name end
 where email = 'GANTI_EMAIL_PEMILIK@contoh.com';

-- Pastikan tepat 1 baris berubah dan hanya ada 1 super admin
select id, email, role, is_active from public.profiles where role = 'super_admin';
