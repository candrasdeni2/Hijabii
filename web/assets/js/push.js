// push.js — Web Push di sisi browser (satu file: logika + tombol + gayanya). Dipakai Admin sekarang, bisa dipakai Customer nanti.
//  - mountPush({ supabase, container }) : memasang baris "Notifikasi di perangkat ini" dan menyelaraskan langganan saat halaman dibuka.
//  - unregisterDevice(supabase)         : lepas perangkat ini dari akun yang sedang login (panggil sebelum signOut).
// Server: Edge Function send-push mengirim ke tabel push_subscriptions. Kunci VAPID PUBLIK ada di config.js (VAPID_PUBLIC_KEY).
import { CONFIG } from "./config.js";
import { toast } from "./ui.js";

const SW_URL = new URL("../../sw.js", import.meta.url);      // web/sw.js
const SW_SCOPE = new URL("../../", import.meta.url).pathname; // web/
const HINT_KEY = "push.hint.shown";

const UA = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const keyOk = () => /^[A-Za-z0-9_-]{80,}$/.test(CONFIG.VAPID_PUBLIC_KEY ?? "");

const firstHint = () => { try { if (sessionStorage.getItem(HINT_KEY)) return false; sessionStorage.setItem(HINT_KEY, "1"); } catch { /* abaikan */ } return true; };
const b64ToBytes = (s) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const sameKey = (buf, b64) => {
  if (!buf) return false;
  const a = new Uint8Array(buf), b = b64ToBytes(b64);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SW_SCOPE))
    ?? navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

/** unsupported | needs-install | unconfigured | denied | off | on */
export async function pushState() {
  if (isIOS && !isStandalone) return "needs-install"; // iPhone/iPad: push hanya jalan dari ikon Layar Utama (iOS 16.4+)
  if (!hasApi) return "unsupported";
  if (!keyOk()) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  return sub && sameKey(sub.options?.applicationServerKey, CONFIG.VAPID_PUBLIC_KEY) ? "on" : "off";
}

async function save(supabase, sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("register_push", {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh ?? "", p_auth: j.keys?.auth ?? "", p_user_agent: UA.slice(0, 300),
  });
  if (error) throw error;
}

async function subscribe(reg) {
  const opts = { userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) };
  const cur = await reg.pushManager.getSubscription();
  if (cur && sameKey(cur.options?.applicationServerKey, CONFIG.VAPID_PUBLIC_KEY)) return cur;
  if (cur) await cur.unsubscribe(); // kunci VAPID berganti: langganan lama tidak berlaku lagi
  return reg.pushManager.subscribe(opts);
}

/** Dipanggil dari klik tombol (izin notifikasi wajib dari gestur pengguna). */
export async function enablePush(supabase) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return pushState();
  const reg = await registration();
  await save(supabase, await subscribe(reg));
  return "on";
}

export async function disablePush(supabase) {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("unregister_push", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return pushState();
}

/** Saat logout: hapus baris perangkat ini dari akun yang keluar, supaya perangkat bersama tidak menerima notifikasi akun itu.
 *  Langganan di browser dibiarkan; akun berikutnya yang login akan mendaftarkannya lagi. Tidak pernah menahan logout > 2 dtk. */
export async function unregisterDevice(supabase) {
  try {
    if (!hasApi || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await Promise.race([supabase.rpc("unregister_push", { p_endpoint: sub.endpoint }), new Promise((r) => setTimeout(r, 2000))]);
  } catch (e) { console.error(e); }
}

/** Notifikasi uji lewat Edge Function (memakai sesi login, hanya ke perangkat milik sendiri). */
async function sendTest(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesi habis, login ulang.");
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: CONFIG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ test: true }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Gagal (${res.status})`);
  return out; // { sent, failed, removed }
}

/* ---------------- Tampilan ---------------- */
const CSS = `
.pu-box{display:grid;gap:8px;padding:12px 16px;border-top:1px solid var(--sand);background:var(--cream)}
.pu-t{margin:0;font-size:13px;font-weight:600;color:var(--ink)}
.pu-s{margin:0;font-size:12.5px;line-height:1.5;color:rgba(43,33,28,.8)}
.pu-row{display:flex;flex-wrap:wrap;gap:8px}
.pu-btn{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--marsala);background:var(--marsala);color:var(--cream);font:500 13px var(--font-sans);cursor:pointer}
.pu-btn.is-ghost{background:transparent;color:var(--marsala)}
.pu-btn:disabled{opacity:.55;cursor:wait}
.pu-on{color:var(--success)}
`;
const TEXT = {
  on: ["Aktif di perangkat ini", "Pesanan baru dan pembatalan akan muncul sebagai notifikasi, juga saat web admin ditutup."],
  off: ["Belum aktif di perangkat ini", "Aktifkan agar pesanan baru tetap sampai walau web admin tidak dibuka."],
  denied: ["Diblokir oleh browser", "Izinkan notifikasi untuk situs ini lewat ikon gembok di address bar (atau pengaturan situs), lalu muat ulang halaman."],
  "needs-install": ["Pasang ke Layar Utama dulu", "Di iPhone/iPad, ketuk Bagikan lalu Tambah ke Layar Utama, buka web dari ikon itu, kemudian aktifkan di sini."],
  unsupported: ["Browser tidak mendukung", "Gunakan Chrome, Edge, Firefox, atau Safari versi terbaru."],
  unconfigured: ["Belum dikonfigurasi", "Kunci VAPID belum diisi di config.js."],
};

export function mountPush({ supabase, container }) {
  if (!document.getElementById("pu-css")) {
    const s = document.createElement("style"); s.id = "pu-css"; s.textContent = CSS; document.head.append(s);
  }
  let state = "off", busy = false, alive = true;

  function paint() {
    const [t, s] = TEXT[state] ?? TEXT.unsupported;
    const btns = state === "off" ? `<button type="button" class="pu-btn" data-act="on">Aktifkan notifikasi</button>`
      : state === "on" ? `<button type="button" class="pu-btn is-ghost" data-act="test">Kirim notifikasi uji</button>
          <button type="button" class="pu-btn is-ghost" data-act="off">Matikan</button>` : "";
    container.innerHTML = `<div class="pu-box"><p class="pu-t">Notifikasi push · <span class="${state === "on" ? "pu-on" : ""}">${t}</span></p>
      <p class="pu-s">${s}</p>${btns ? `<div class="pu-row">${btns}</div>` : ""}</div>`;
    container.querySelectorAll("button").forEach((b) => { b.disabled = busy; });
  }
  const refresh = async () => { try { state = await pushState(); } catch (e) { console.error(e); state = "unsupported"; } if (alive) paint(); };

  async function act(kind) {
    busy = true; paint();
    try {
      if (kind === "on") {
        state = await enablePush(supabase);
        toast(state === "on" ? "Notifikasi push aktif di perangkat ini." : "Izin notifikasi tidak diberikan.", state === "on" ? "success" : "warning");
      } else if (kind === "off") {
        state = await disablePush(supabase); toast("Notifikasi push dimatikan di perangkat ini.", "info");
      } else {
        const r = await sendTest(supabase);
        toast(r.sent > 0 ? "Notifikasi uji dikirim. Cek perangkat Anda." : "Tidak ada perangkat terdaftar. Coba matikan lalu aktifkan lagi.", r.sent > 0 ? "success" : "warning");
      }
    } catch (e) {
      console.error(e); toast(`Gagal: ${e.message ?? e}`, "error", 6000);
    } finally { busy = false; await refresh(); }
  }
  container.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b && !busy) act(b.dataset.act); });

  // Saat halaman dibuka: daftarkan service worker, selaraskan langganan ke akun yang login, dan beri petunjuk sekali per sesi.
  (async () => {
    await refresh();
    try {
      if (Notification.permission === "granted" && hasApi && keyOk()) {
        const reg = await registration();
        await save(supabase, await subscribe(reg)); // izin sudah ada: tidak butuh gestur; memperbarui baris/endpoint yang berubah
        await refresh();
      } else if (state === "off" && firstHint()) {
        toast("Aktifkan notifikasi push lewat ikon lonceng agar pesanan baru tetap sampai saat web ditutup.", "info", 7000);
      }
    } catch (e) { console.error(e); }
  })();

  return () => { alive = false; };
}
