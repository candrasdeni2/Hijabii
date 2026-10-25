// Edge Function send-push — mengirim Web Push ke perangkat milik user.
// Dua pemanggil:
//  1) Database Webhook (INSERT pada public.notifications), dikenali dari header x-webhook-secret.
//  2) Tombol "Kirim notifikasi uji" di web (Bearer token user yang login), hanya ke perangkat milik sendiri.
// Deploy dengan --no-verify-jwt (pengecekan dilakukan di sini). Secret: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, WEBHOOK_SECRET.
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan otomatis oleh Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-webhook-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: string, b: string) => { // bandingkan tanpa bocor panjang kecocokan
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

type Payload = { title: string; body: string; path: string; tag?: string };

async function sendTo(userId: string, payload: Payload) {
  const { data: subs, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) throw error;
  let sent = 0, failed = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); removed++; } // perangkat sudah mencabut izin
      else { failed++; console.error("push gagal", code, (e as Error).message); }
    }
  }));
  return { sent, failed, removed };
}

// Tujuan ketika notifikasi diklik, relatif terhadap folder web/ (lihat sw.js).
// type = tipe notifikasi (mis. 'invoice_direvisi'); dipakai agar customer langsung ke invoice.
function pathFor(role: string | null, data: Record<string, unknown> | null, type?: string | null) {
  const id = String(data?.order_id ?? "");
  if (role === "admin") return UUID.test(id) ? `admin/#/pesanan/${id}` : "admin/";
  if (role === "super_admin") return "superadmin/";
  if (role === "customer") {
    if (UUID.test(id)) return type === "invoice_direvisi" ? `toko/#/pesanan/${id}/invoice` : `toko/#/pesanan/${id}`;
    return type === "password_diubah" ? "toko/#/profil" : "toko/#/pesanan";
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Metode tidak diizinkan" }, 405);

  try {
    // 1) Database Webhook
    const secret = req.headers.get("x-webhook-secret");
    if (secret !== null) {
      if (!same(secret, env("WEBHOOK_SECRET"))) return json({ error: "Tidak diizinkan" }, 401);
      const { type, table, record } = await req.json();
      if (type !== "INSERT" || table !== "notifications" || !record || !UUID.test(record.user_id ?? "")) return json({ skipped: true });
      const { data: prof } = await db.from("profiles").select("role").eq("id", record.user_id).maybeSingle();
      const out = await sendTo(record.user_id, {
        title: record.title, body: record.body ?? "", path: pathFor(prof?.role ?? null, record.data, record.type), tag: record.id,
      });
      return json(out);
    }

    // 2) Notifikasi uji dari web (sesi login)
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Tidak diizinkan" }, 401);
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json({ error: "Sesi tidak valid, login ulang." }, 401);
    const body = await req.json().catch(() => ({}));
    if (!body?.test) return json({ error: "Permintaan tidak dikenal" }, 400);
    const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return json(await sendTo(user.id, {
      title: "Notifikasi uji", body: "Web push Hijabii berfungsi di perangkat ini.",
      path: prof?.role === "customer" ? "toko/" : pathFor(prof?.role ?? null, null), tag: "test",
    }));
  } catch (e) {
    console.error(e);
    return json({ error: "Gagal mengirim notifikasi" }, 500);
  }
});