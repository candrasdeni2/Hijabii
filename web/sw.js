// sw.js — Service worker Hijabii by Intan. Letakkan di folder web/ (sejajar index.html) supaya cakupannya meliputi /admin/, /toko/, dst.
// Tugasnya hanya satu: menerima Web Push dari server dan menampilkan notifikasi saat web TIDAK sedang dibuka.
// Isi push dikirim Edge Function send-push: { title, body, path, tag }. "path" relatif terhadap folder web/ (mis. "admin/#/pesanan/<id>").

// Safari/iOS mewajibkan setiap push menampilkan notifikasi; browser lain boleh diam kalau webnya sedang dilihat.
const SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(self.navigator.userAgent);
const scopeUrl = (p = "") => new URL(p, self.registration.scope);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch { d = { body: event.data ? event.data.text() : "" }; }

  const title = String(d.title || "Hijabii by Intan").slice(0, 120);
  const options = {
    body: String(d.body || "").slice(0, 240),
    icon: scopeUrl("assets/img/icon-192.png").href,
    badge: scopeUrl("assets/img/icon-192.png").href,
    tag: d.tag || undefined,          // tag sama = menggantikan notifikasi lama, bukan menumpuk
    renotify: Boolean(d.tag),
    data: { path: typeof d.path === "string" ? d.path : "" },
  };

  event.waitUntil((async () => {
    if (!SAFARI) {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((c) => c.focused)) return; // web sedang dilihat: lonceng real-time di dalam web sudah memberi tahu
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = scopeUrl(event.notification.data?.path || "").href;
  const dir = new URL(target).pathname.replace(/[^/]*$/, ""); // folder tujuan, mis. /admin/

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = wins.find((c) => new URL(c.url).pathname.startsWith(dir));
    if (same) {
      await same.focus();
      if ("navigate" in same) { try { await same.navigate(target); } catch { /* tab tetap terfokus */ } }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
