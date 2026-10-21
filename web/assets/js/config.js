// config.js — nilai PUBLIK saja. ANON key aman di browser (dilindungi RLS).
// JANGAN pernah menaruh SUPABASE_SERVICE_ROLE_KEY, kunci API ongkir, atau VAPID private key di sini.
export const CONFIG = {
  SUPABASE_URL: 'https://rcuizokrpkvsuskrysjs.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_IFKlgEwcf0fDqR4SyD-UJA_vmHkgodZ',
  STORAGE_BUCKET: 'hijabii-images',
  TIMEZONE: 'Asia/Jakarta',
  VAPID_PUBLIC_KEY: 'BAlarOGlqVqJdYLIXLltljghY63XnlcHaFRHppPDCItLors0QPAMGoaUiqB2YhWh9LFv-lWbRl4i50KIfLEN9mM', // kunci PUBLIK web push (pasangan private-nya hanya di secret Edge Function)
};
export const isConfigured = () => !CONFIG.SUPABASE_URL.includes('GANTI') && !CONFIG.SUPABASE_ANON_KEY.includes('GANTI');