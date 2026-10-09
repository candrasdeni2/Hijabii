import { HttpError, requireRole, type Role } from './auth.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const site = Deno.env.get('SITE_URL') ?? '';
  const ok = origin === site || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : site,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Batas laju sederhana per instance (cukup untuk V1; untuk ketat pakai tabel/Redis)
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'rate_limited', 'Terlalu banyak percobaan. Coba lagi sebentar.');
  arr.push(now); hits.set(key, arr);
}

/** Tolak field tak dikenal. */
export function strictKeys(body: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(body))
    if (!allowed.includes(k)) throw new HttpError(422, 'invalid_input', `Field tidak dikenal: ${k}`);
}

type Ctx = Awaited<ReturnType<typeof requireRole>> & { body: Record<string, unknown> };

export function handle(roles: Role[], fn: (ctx: Ctx) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req);
    const reply = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metode tidak diizinkan.');
      const auth = await requireRole(req, roles);
      rateLimit(auth.user.id);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new HttpError(422, 'invalid_input', 'Body harus berupa objek JSON.');
      const data = await fn({ ...auth, body });
      return reply(200, { ok: true, data });
    } catch (e) {
      if (e instanceof HttpError)
        return reply(e.status, { ok: false, error: { code: e.code, message: e.message } });
      console.error('unhandled error:', (e as Error).message); // jangan log body (bisa berisi password)
      return reply(500, { ok: false, error: { code: 'internal', message: 'Terjadi kesalahan. Coba lagi.' } });
    }
  });
}
