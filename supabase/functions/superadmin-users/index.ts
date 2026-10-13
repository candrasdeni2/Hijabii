// Edge Function: superadmin-users
// Operasi akun yang butuh service role. Hanya boleh dipanggil oleh akun ber-role super_admin yang aktif.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BAN_FOREVER = "876000h"; // ± 100 tahun

function genPassword(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // tanpa huruf/angka yang mirip
  const limit = Math.floor(0x100000000 / chars.length) * chars.length;
  for (;;) {
    let out = "";
    while (out.length < len) {
      const [n] = crypto.getRandomValues(new Uint32Array(1));
      if (n < limit) out += chars[n % chars.length];
    }
    if (/[A-Z]/.test(out) && /[a-z]/.test(out) && /[0-9]/.test(out)) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. Autentikasi + otorisasi (selalu dicek di server, bukan di UI)
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) throw new HttpError(401, "Belum masuk.");
    const { data: ud, error: ue } = await svc.auth.getUser(jwt);
    if (ue || !ud?.user) throw new HttpError(401, "Sesi tidak valid. Silakan masuk kembali.");
    const { data: me } = await svc.from("profiles").select("id, role, is_active, full_name, email").eq("id", ud.user.id).single();
    if (!me || me.role !== "super_admin" || me.is_active === false) throw new HttpError(403, "Akses ditolak.");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Catatan aktivitas (tabel activity_logs: actor_id, action, target_type, target_id, meta). Password TIDAK PERNAH dicatat.
    // Aktivasi/nonaktifasi akun dicatat otomatis oleh trigger profiles_log_active, jadi tidak ditulis ulang di sini.
    const log = async (act: string, target: { id?: string | null; full_name?: string | null; email?: string | null } | null, extra: Record<string, unknown> = {}) => {
      const { error } = await svc.from("activity_logs").insert({
        actor_id: me.id,
        action: act,
        target_type: "profile",
        target_id: target?.id ?? null,
        meta: { target_name: target?.full_name ?? null, target_email: target?.email ?? null, ...extra },
      });
      if (error) console.error("activity_logs insert gagal:", error.message);
    };

    // Klien atas nama pemanggil (RLS + auth.uid() = super admin), agar trigger database mencatat pelakunya.
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const revokeSessions = async (uid: string) => {
      const { error } = await svc.rpc("revoke_user_sessions", { p_user: uid });
      if (error) console.error("revoke_user_sessions gagal:", error.message);
    };

    // Ambil akun target + aturan keamanan umum
    const getTarget = async (id: unknown, allowed: string[]) => {
      if (typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "ID akun tidak valid.");
      if (id === me.id) throw new HttpError(400, "Tidak bisa dilakukan pada akun Anda sendiri.");
      const { data: t } = await svc.from("profiles").select("id, full_name, email, role, is_active").eq("id", id).single();
      if (!t) throw new HttpError(404, "Akun tidak ditemukan.");
      if (t.role === "super_admin") throw new HttpError(403, "Akun Super Admin tidak bisa diubah dari sini.");
      if (!allowed.includes(t.role)) throw new HttpError(403, "Jenis akun ini tidak diizinkan untuk aksi tersebut.");
      return t;
    };

    const pickPassword = (): { password: string; generated: boolean } => {
      if (body.generate) return { password: genPassword(), generated: true };
      const p = String(body.password ?? "");
      if (p.length < 8 || p.length > 72) throw new HttpError(400, "Password harus 8 sampai 72 karakter.");
      return { password: p, generated: false };
    };

    switch (action) {
      case "create_admin": {
        const full_name = String(body.full_name ?? "").trim().slice(0, 100);
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!full_name) throw new HttpError(400, "Nama wajib diisi.");
        if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email tidak valid.");
        const { password, generated } = pickPassword();

        const { data: created, error: ce } = await svc.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name },
        });
        if (ce || !created?.user) {
          if (/already|registered|exists/i.test(ce?.message ?? "")) throw new HttpError(409, "Email sudah terdaftar.");
          throw new HttpError(400, "Gagal membuat akun. " + (ce?.message ?? ""));
        }
        const uid = created.user.id;
        const fields = { full_name, email, role: "admin", is_active: true, must_change_password: true };
        const { data: upd, error: pe } = await svc.from("profiles").update(fields).eq("id", uid).select("id");
        let failed = !!pe;
        if (!failed && (!upd || upd.length === 0)) {
          const { error: ie } = await svc.from("profiles").insert({ id: uid, ...fields });
          failed = !!ie;
        }
        if (failed) {
          await svc.auth.admin.deleteUser(uid); // batalkan agar tidak ada akun setengah jadi
          throw new HttpError(500, "Akun gagal disiapkan. Tidak ada perubahan yang disimpan.");
        }
        await log("admin_created", { id: uid, full_name, email }, { metode: generated ? "otomatis" : "manual" });
        return json({ ok: true, user_id: uid, password: generated ? password : undefined });
      }

      case "set_active": {
        const t = await getTarget(body.user_id, ["admin", "customer"]);
        const active = body.active === true;
        const { data: upd, error: pe } = await asCaller.from("profiles").update({ is_active: active }).eq("id", t.id).select("id");
        if (pe || !upd?.length) throw new HttpError(500, "Gagal memperbarui status akun.");
        const { error: ae } = await svc.auth.admin.updateUserById(t.id, { ban_duration: active ? "none" : BAN_FOREVER });
        if (ae) {
          await asCaller.from("profiles").update({ is_active: !active }).eq("id", t.id); // kembalikan
          throw new HttpError(500, "Gagal memperbarui akses login akun.");
        }
        if (!active) await revokeSessions(t.id);
        return json({ ok: true });
      }

      case "delete_user": {
        const t = await getTarget(body.user_id, ["admin"]); // hanya admin yang boleh dihapus (pelanggan punya riwayat pesanan)
        const { error: de } = await svc.auth.admin.deleteUser(t.id);
        if (de) {
          throw new HttpError(409, "Akun tidak bisa dihapus karena masih punya data terkait. Nonaktifkan saja.");
        }
        await svc.from("profiles").delete().eq("id", t.id); // aman bila sudah ikut terhapus (cascade)
        await log("user_deleted", t, { role: t.role });
        return json({ ok: true });
      }

      case "set_password": {
        const t = await getTarget(body.user_id, ["admin", "customer"]);
        const { password, generated } = pickPassword();
        const { error: ae } = await svc.auth.admin.updateUserById(t.id, { password });
        if (ae) throw new HttpError(400, "Gagal mengganti password. " + ae.message);
        await svc.from("profiles").update({ must_change_password: true, password_reset_notice_at: new Date().toISOString() }).eq("id", t.id);
        await revokeSessions(t.id); // sign-out semua sesi lama
        const { error: ne } = await svc.from("notifications").insert({
          user_id: t.id, type: "password_diubah", title: "Password diubah",
          body: "Password akun Anda diubah oleh Super Admin. Anda wajib menggantinya saat masuk.", data: {},
        });
        if (ne) console.error("notifikasi gagal:", ne.message);
        await log("password_changed", t, { metode: generated ? "otomatis" : "manual" });
        return json({ ok: true, password: generated ? password : undefined });
      }

      case "send_reset": {
        const t = await getTarget(body.user_id, ["admin", "customer"]);
        const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
        const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: re } = await pub.auth.resetPasswordForEmail(t.email!, { redirectTo });
        if (re) throw new HttpError(429, "Link reset gagal dikirim. " + re.message);
        await log("reset_link_sent", t);
        return json({ ok: true });
      }

      case "update_profile": {
        const t = await getTarget(body.user_id, ["admin", "customer"]);
        const full_name = String(body.full_name ?? "").trim().slice(0, 100);
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!full_name) throw new HttpError(400, "Nama wajib diisi.");
        if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email tidak valid.");
        const emailChanged = email !== (t.email ?? "").toLowerCase();
        if (!emailChanged && full_name === (t.full_name ?? "")) return json({ ok: true }); // tidak ada perubahan

        const { error: ae } = await svc.auth.admin.updateUserById(t.id, {
          email, email_confirm: true, user_metadata: { full_name },
        });
        if (ae) {
          if (/already|registered|exists/i.test(ae.message)) throw new HttpError(409, "Email sudah terdaftar.");
          throw new HttpError(400, "Gagal memperbarui akun. " + ae.message);
        }
        const { error: pe } = await svc.from("profiles").update({ full_name, email }).eq("id", t.id);
        if (pe) {
          // kembalikan data auth agar tidak ada akun setengah berubah
          await svc.auth.admin.updateUserById(t.id, { email: t.email ?? undefined, user_metadata: { full_name: t.full_name } });
          throw new HttpError(500, "Gagal menyimpan perubahan. Tidak ada yang berubah.");
        }
        if (emailChanged) await revokeSessions(t.id); // email = identitas login, sesi lama dikeluarkan
        await log("profile_updated", t, { nama_baru: full_name, email_baru: email }); // target_name/target_email = nilai lama
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, "Aksi tidak dikenal.");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Terjadi kesalahan di server." }, 500);
  }
});