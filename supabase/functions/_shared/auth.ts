import { createClient } from 'npm:@supabase/supabase-js@2';

export type Role = 'customer' | 'admin' | 'super_admin';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const URL_ = Deno.env.get('https://rcuizokrpkvsuskrysjs.supabase.co')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const adminClient = () =>
  createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export const anonClient = () =>
  createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

export async function requireRole(req: Request, allowed: Role[]) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) throw new HttpError(401, 'unauthenticated', 'Silakan masuk lagi.');
  const userClient = createClient(URL_, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, 'unauthenticated', 'Silakan masuk lagi.');
  const admin = adminClient();
  const { data: p } = await admin.from('profiles')
    .select('id, role, is_active, must_change_password').eq('id', user.id).single();
  if (!p || !p.is_active || p.must_change_password || !allowed.includes(p.role))
    throw new HttpError(403, 'forbidden', 'Kamu tidak punya akses untuk aksi ini.');
  return { user, profile: p as { id: string; role: Role }, admin };
}
'@ | Set-Content -Encoding UTF8 C:\xampp\htdocs\HIjabii\supabase\functions\_shared\auth.ts
