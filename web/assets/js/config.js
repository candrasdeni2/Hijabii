// config.js — nilai PUBLIK saja. ANON key aman di browser (dilindungi RLS).
// JANGAN pernah menaruh SUPABASE_SERVICE_ROLE_KEY, kunci API ongkir, atau VAPID private key di sini.
export const CONFIG = {
  SUPABASE_URL: 'https://rcuizokrpkvsuskrysjs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdWl6b2tycGt2c3Vza3J5c2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NTIxOTUsImV4cCI6MjEwNzAyODE5NX0.hK97NldRGO_E_7aC-FaJxAF8V_WCjWGFXTdmOfnk3Ww',
  STORAGE_BUCKET: 'hijabii-images',
  TIMEZONE: 'Asia/Jakarta',
};
export const isConfigured = () => !CONFIG.SUPABASE_URL.includes('GANTI') && !CONFIG.SUPABASE_ANON_KEY.includes('GANTI');
