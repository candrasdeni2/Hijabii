import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { CONFIG, isConfigured } from './config.js';

export const supabase = isConfigured()
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** URL publik foto di bucket (WebP, baca publik). Kosong -> null agar UI memakai placeholder. */
export function imageUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
