import { supabase } from './supabase.js';
import { ROUTES, roleHome } from './routes.js';

const PROFILE_COLS = 'id, full_name, email, role, is_active, must_change_password, password_reset_notice_at';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', session.user.id).single();
  if (error) throw error;
  return data;
}
export const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();

/**
 * Penjaga halaman. Urutan pemeriksaan (rulesapp.md bagian 13-14):
 *   belum login -> login | akun nonaktif -> keluar | wajib ganti password -> layar ganti password | peran salah -> 403
 * Mengembalikan profil bila lolos; selain itu mengalihkan dan mengembalikan null.
 * Catatan: ini hanya kenyamanan UI. Penegakan sebenarnya ada di RLS/RPC database.
 */
export async function requireAuth({ roles, redirect = true } = {}) {
  const profile = await getProfile().catch(() => null);
  const go = (url) => { if (redirect) location.replace(url); return null; };
  if (!profile) return go(`${ROUTES.login}?next=${encodeURIComponent(location.pathname + location.search)}`);
  if (!profile.is_active) { await signOut(); return go(`${ROUTES.login}?reason=nonaktif`); }
  if (profile.must_change_password && !location.pathname.endsWith(ROUTES.changePassword)) return go(ROUTES.changePassword);
  if (roles && !roles.includes(profile.role)) return go(`${roleHome(profile.role)}?error=403`);
  return profile;
}
