// Komponen unggah foto (design.md bagian 7 dan 9.4).
// Alur: pilih/tarik file -> kompres di browser ke WebP (sisi terpanjang <= 1200 px, <= 2 MB) -> pratinjau -> unggah ke
// bucket publik 'hijabii-images' dengan progress -> onChange(path). Penyimpanan path ke tabel (image_path) dilakukan halaman pemakai.
// File lama yang tergantikan setelah path-nya tersimpan di database masuk antrean hapus otomatis lewat trigger
// (storage_delete_queue -> Edge Function storage-cleanup). File yang diunggah tetapi belum pernah disimpan dihapus langsung oleh komponen ini.
import { supabase, imageUrl } from "./supabase.js";
import { CONFIG } from "./config.js";
import { esc } from "./panel-kit.js";

export class PhotoError extends Error { constructor(m) { super(m); this.name = "PhotoError"; } }

export const LIMITS = {
  maxSide: 1200,          // px, sisi terpanjang
  maxBytes: 1_950_000,    // bucket menolak > 2 MiB (2.097.152 B); sisakan margin
  maxInputBytes: 25 * 1024 * 1024,
};
const ACCEPT = "image/jpeg,image/png,image/webp";

export const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* coba cara lain */ }
  try { return await createImageBitmap(file); } catch { /* coba <img> */ }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight, _img: img }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new PhotoError("Foto tidak bisa dibaca. Gunakan JPG, PNG, atau WebP.")); };
    img.src = url;
  });
}

function encode(src, w, h, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Browser ini tidak bisa memproses gambar.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => {
    if (!b || b.type !== "image/webp") reject(new PhotoError("Browser ini tidak bisa membuat gambar WebP. Gunakan Chrome, Edge, atau Firefox terbaru."));
    else resolve(b);
  }, "image/webp", quality));
}

/** Kecilkan + ubah ke WebP. Kualitas diturunkan bertahap, lalu dimensi, sampai <= maxBytes. */
export async function compressToWebp(file, { maxSide = LIMITS.maxSide, maxBytes = LIMITS.maxBytes } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new PhotoError("Pilih file gambar JPG, PNG, atau WebP.");
  if (file.size > LIMITS.maxInputBytes) throw new PhotoError("Foto terlalu besar (maksimal 25 MB sebelum dikompres).");
  const bmp = await decode(file);
  const src = bmp._img ?? bmp;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));    // tidak pernah memperbesar
  let w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  let q = 0.82;
  try {
    for (let i = 0; i < 10; i++) {
      const blob = await encode(src, w, h, q);
      if (blob.size <= maxBytes) return { blob, width: w, height: h, quality: q };
      if (q > 0.5) q = Math.round((q - 0.1) * 100) / 100;
      else { w = Math.max(1, Math.round(w * 0.85)); h = Math.max(1, Math.round(h * 0.85)); }
    }
  } finally { bmp.close?.(); }
  throw new PhotoError("Foto tidak bisa dikecilkan sampai di bawah 2 MB. Coba foto lain.");
}

/** Unggah Blob WebP ke bucket dengan progress (0..1). Nama file acak, tidak pernah menimpa file lain. */
export async function uploadImage(blob, { folder = "misc", onProgress, signal } = {}) {
  if (!supabase) throw new PhotoError("Aplikasi belum dikonfigurasi.");
  if (!/^[a-z0-9][a-z0-9/_-]*$/.test(folder)) throw new PhotoError("Folder unggahan tidak valid.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new PhotoError("Sesi berakhir. Masuk kembali.");
  const path = `${folder}/${uid()}.webp`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${CONFIG.SUPABASE_URL}/storage/v1/object/${CONFIG.STORAGE_BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", CONFIG.SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", "image/webp");
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");   // nama file unik -> aman di-cache lama
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve({ path }); return; }
      const msg = ({ 401: "Sesi berakhir atau tidak punya izin. Masuk kembali sebagai admin.", 403: "Kamu tidak punya izin mengunggah foto.",
        413: "File terlalu besar untuk server (maksimal 2 MB).", 415: "Format tidak didukung (harus WebP)." })[xhr.status];
      reject(new PhotoError(msg ?? "Unggah gagal. Coba lagi."));
    };
    xhr.onerror = () => reject(new PhotoError("Koneksi terputus saat mengunggah. Coba lagi."));
    xhr.onabort = () => reject(Object.assign(new PhotoError("Unggah dibatalkan."), { aborted: true }));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** Hapus file yang kita unggah sendiri tetapi tidak jadi dipakai (belum ada di database). Best-effort. */
export async function removeUploaded(paths) {
  const list = (paths ?? []).filter(Boolean);
  if (!list.length || !supabase) return;
  try { await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove(list); } catch (e) { console.warn("Hapus file sisa gagal:", e); }
}

const CSS = `
.pu{display:grid;gap:10px;max-width:22rem}
.pu-frame{position:relative;border:1px dashed var(--mocha);border-radius:16px;background:linear-gradient(135deg,#E8DCCD,#D8C6B5);overflow:hidden}
.pu-frame.is-over{border-color:var(--marsala);box-shadow:0 0 0 3px rgba(123,74,74,.18)}
.pu-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pu-drop{position:absolute;inset:0;display:grid;place-content:center;gap:4px;text-align:center;padding:16px;cursor:pointer;color:var(--ink)}
.pu-drop:focus-within{outline:2px solid var(--marsala);outline-offset:-4px}
.pu-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.pu-drop-title{font-weight:600;font-size:14px}
.pu-drop-hint{font-size:12px;color:rgba(43,33,28,.7)}
.pu-overlay{position:absolute;inset:0;display:grid;place-content:center;gap:10px;padding:20px;background:rgba(43,33,28,.55);color:var(--cream);text-align:center}
.pu-bar{width:min(220px,70vw);height:8px;border-radius:999px;background:rgba(246,240,231,.3);overflow:hidden}
.pu-bar i{display:block;height:100%;width:0;background:var(--cream);transition:width .15s linear}
.pu-info{margin:0;font-size:12px;color:rgba(43,33,28,.7);min-height:18px}
.pu-info.err{color:var(--error,#9E3D3D);font-size:13px}
.pu-actions{display:flex;gap:8px;flex-wrap:wrap}
.pu [hidden]{display:none!important}
.pu[data-state="empty"] .pu-img,.pu[data-state="empty"] .pu-overlay,.pu[data-state="ready"] .pu-overlay{display:none}
.pu[data-state="busy"] .pu-drop,.pu[data-state="ready"] .pu-drop{display:none}
@media(prefers-reduced-motion:reduce){.pu-bar i{transition:none}}
`;
let styled = false;
function ensureStyles() {
  if (styled || typeof document === "undefined") return;
  const s = document.createElement("style"); s.setAttribute("data-photo-upload", ""); s.textContent = CSS; document.head.append(s); styled = true;
}

/**
 * mountPhotoUpload({ root, folder, value, label, aspect, maxSide, onChange, onBusyChange, deps })
 *  - value: path yang sudah tersimpan di database (atau null)
 *  - onChange(path|null, { width, height, bytes }|null): dipanggil setelah unggah selesai / foto dihapus
 *  - kembalian: get(), set(path), isBusy(), markSaved(), discardUnsaved(), destroy()
 * Halaman pemakai: simpan path ke tabel setelah onChange, lalu panggil markSaved(). Saat dialog ditutup tanpa menyimpan: discardUnsaved().
 */
export function mountPhotoUpload({ root, folder = "misc", value = null, label = "Foto", aspect = "4 / 5", maxSide = LIMITS.maxSide,
  inputId = `photo-${uid().slice(0, 8)}`, onChange = () => {}, onBusyChange = () => {}, deps = {} } = {}) {
  ensureStyles();
  const d = { compress: compressToWebp, upload: uploadImage, remove: removeUploaded, url: imageUrl, ...deps };
  let path = value || null;
  const fresh = new Set();           // diunggah sesi ini, belum disimpan ke database
  let state = path ? "ready" : "empty";
  let blobUrl = null, abort = null, busy = false;

  root.innerHTML = `
    <div class="pu" data-state="${state}">
      <div class="pu-frame" style="aspect-ratio:${esc(aspect)}">
        <img class="pu-img" alt="${esc(label)}" ${path ? "" : "hidden"}>
        <label class="pu-drop" for="${esc(inputId)}">
          <input class="pu-file" id="${esc(inputId)}" type="file" accept="${ACCEPT}" aria-label="Pilih ${esc(label.toLowerCase())}">
          <span class="pu-drop-title">Pilih atau tarik foto ke sini</span>
          <span class="pu-drop-hint">JPG, PNG, atau WebP. Otomatis dikompres ke WebP.</span>
        </label>
        <div class="pu-overlay">
          <span data-stage>Memproses…</span>
          <div class="pu-bar" role="progressbar" aria-label="Progres unggah" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        </div>
      </div>
      <p class="pu-info" data-info role="status" aria-live="polite"></p>
      <div class="pu-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-replace>Ganti foto</button>
        <button type="button" class="btn btn-danger-outline btn-sm" data-remove>Hapus foto</button>
        <button type="button" class="btn btn-secondary btn-sm" data-cancel>Batal</button>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const box = q(".pu"), frame = q(".pu-frame"), img = q(".pu-img"), file = q(".pu-file"), info = q("[data-info]");
  const stage = q("[data-stage]"), bar = q(".pu-bar"), fill = q(".pu-bar i");

  const setBusy = (b) => { if (busy !== b) { busy = b; onBusyChange(b); } };
  const bReplace = q("[data-replace]"), bRemove = q("[data-remove]"), bCancel = q("[data-cancel]");
  const setState = (s) => {
    state = s; box.dataset.state = s;
    bReplace.hidden = bRemove.hidden = s !== "ready";   // hanya saat sudah ada foto
    bCancel.hidden = s !== "busy";                      // hanya saat memproses/mengunggah
  };
  const say = (t, err = false) => { info.textContent = t; info.classList.toggle("err", err); };
  const progress = (p) => { const n = Math.round(p * 100); fill.style.width = `${n}%`; bar.setAttribute("aria-valuenow", String(n)); };
  const setImg = (src) => { if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute("src"); img.hidden = true; } };
  const dropBlobUrl = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } };
  const dropPrevious = async (prev) => { if (prev && fresh.has(prev)) { fresh.delete(prev); await d.remove([prev]); } };  // sisa unggahan yang tak pernah disimpan

  setState(state);
  if (path) setImg(d.url(path));

  async function handle(f) {
    if (!f || busy) return;
    say(""); setBusy(true); setState("busy"); progress(0); stage.textContent = "Mengompres…";
    abort = new AbortController();
    try {
      const { blob, width, height } = await d.compress(f, { maxSide });
      dropBlobUrl(); blobUrl = URL.createObjectURL(blob); setImg(blobUrl);        // pratinjau langsung dari hasil kompres
      stage.textContent = "Mengunggah…";
      const { path: np } = await d.upload(blob, { folder, onProgress: progress, signal: abort.signal });
      const prev = path;
      path = np; fresh.add(np);
      setImg(d.url(np) ?? blobUrl);
      setState("ready");
      say(`WebP · ${width}×${height} · ${formatBytes(blob.size)}`);
      onChange(np, { width, height, bytes: blob.size });
      await dropPrevious(prev);
    } catch (e) {
      dropBlobUrl();
      setImg(path ? d.url(path) : null);
      if (e?.aborted) { setState(path ? "ready" : "empty"); say("Unggah dibatalkan."); }
      else { setState(path ? "ready" : "empty"); say(e?.name === "PhotoError" ? e.message : "Foto gagal diproses. Coba foto lain.", true); }
    } finally {
      abort = null; setBusy(false); file.value = "";
    }
  }

  file.addEventListener("change", () => handle(file.files?.[0]));
  q("[data-replace]").addEventListener("click", () => file.click());
  q("[data-cancel]").addEventListener("click", () => abort?.abort());
  q("[data-remove]").addEventListener("click", async () => {
    if (busy) return;
    const prev = path; path = null; dropBlobUrl(); setImg(null); setState("empty"); say("Foto dihapus. Simpan untuk menerapkan.");
    onChange(null, null);
    await dropPrevious(prev);
  });
  const over = (on) => frame.classList.toggle("is-over", on);
  frame.addEventListener("dragover", (e) => { e.preventDefault(); over(true); });
  frame.addEventListener("dragleave", () => over(false));
  frame.addEventListener("drop", (e) => { e.preventDefault(); over(false); handle(e.dataTransfer?.files?.[0]); });

  return {
    get: () => path,
    isBusy: () => busy,
    set(p) { path = p || null; dropBlobUrl(); setImg(path ? d.url(path) : null); setState(path ? "ready" : "empty"); say(""); },
    markSaved() { fresh.clear(); },
    async discardUnsaved() { const rest = [...fresh]; fresh.clear(); await d.remove(rest); },
    destroy() { abort?.abort(); dropBlobUrl(); root.innerHTML = ""; },
  };
}
