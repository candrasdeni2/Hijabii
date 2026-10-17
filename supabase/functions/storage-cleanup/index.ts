// Edge Function: storage-cleanup
// Menghapus file lama di bucket 'hijabii-images' berdasarkan tabel storage_delete_queue.
// Dua cara memanggil:
//   1) Terjadwal: pg_cron + pg_net, dengan header  x-cron-secret: <CRON_SECRET>
//   2) Manual dari panel: login admin / super admin (header Authorization seperti biasa)
// Deploy dengan  --no-verify-jwt  karena function ini memeriksa kuncinya sendiri (pemanggil cron tidak punya JWT pengguna).
import { adminClient, HttpError, requireRole } from '../_shared/auth.ts';
import { cleanupQueue, CleanupError } from './cleanup.ts';

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const site = Deno.env.get('SITE_URL') ?? '';
  const ok = origin === site || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : site,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function safeEqual(a: string, b: string) {
  const enc = new TextEncoder(), x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function authorize(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== null) {
    const expected = Deno.env.get('CRON_SECRET');
    if (!expected) throw new HttpError(503, 'not_configured', 'CRON_SECRET belum diatur di Supabase secrets.');
    if (!safeEqual(secret, expected)) throw new HttpError(401, 'unauthenticated', 'Kunci tidak valid.');
    return;
  }
  await requireRole(req, ['admin', 'super_admin']);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metode tidak diizinkan.');
    await authorize(req);
    const report = await cleanupQueue(adminClient());
    console.log('storage-cleanup:', JSON.stringify(report));
    return reply(200, { ok: true, data: report });
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { ok: false, error: { code: e.code, message: e.message } });
    if (e instanceof CleanupError) return reply(500, { ok: false, error: { code: 'cleanup_failed', message: e.message } });
    console.error('unhandled error:', (e as Error).message);
    return reply(500, { ok: false, error: { code: 'internal', message: 'Terjadi kesalahan. Coba lagi.' } });
  }
});
