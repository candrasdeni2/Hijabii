// Foto produk: kompres di browser (WebP, sisi terpanjang maks 1200 px, maks 2 MB) lalu unggah ke bucket Storage.
// Bucket hanya menerima image/webp <= 2 MB (lihat 001_schema.sql bagian 11), jadi semua foto WAJIB lewat compressToWebp().
// Penghapusan file lama ditangani trigger database (storage_delete_queue) saat image_path diganti/dihapus.
import { supabase, imageUrl } from "../assets/js/supabase.js";
import { CONFIG } from "../assets/js/config.js";

export { imageUrl };
export const MAX_SIDE = 1200;
export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** Pemeriksaan cepat sebelum file diproses. Mengembalikan pesan error, atau "" bila lolos. */
export function checkImageFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) return "File harus berupa gambar (JPG, PNG, atau WebP).";
  if (file.size > MAX_INPUT_BYTES) return "Ukuran file terlalu besar (maksimal 30 MB).";
  return "";
}

const toWebp = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));

export async function compressToWebp(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error("Foto tidak bisa dibaca. Coba format JPG, PNG, atau WebP."); }
  }
  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    for (let round = 0; round < 6; round++) {
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
      for (const q of [0.85, 0.75, 0.65, 0.5]) {
        const blob = await toWebp(canvas, q);
        if (!blob || blob.type !== "image/webp") throw new Error("Browser ini tidak mendukung kompres WebP. Gunakan Chrome, Edge, atau Firefox terbaru.");
        if (blob.size <= MAX_BYTES) return blob;
      }
      scale *= 0.8; // masih > 2 MB: kecilkan dimensi lalu ulangi
    }
    throw new Error("Foto masih terlalu besar setelah dikompres. Pilih foto lain.");
  } finally { bmp.close?.(); }
}

/** Mengunggah Blob WebP ke `${folder}/<uuid>.webp` dan mengembalikan path-nya (disimpan sebagai image_path). */
export async function uploadWebp(blob, folder) {
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).upload(path, blob, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false,
  });
  if (error) throw new Error(error.message || "Foto gagal diunggah.");
  return path;
}

/** Hanya untuk membersihkan file yang baru diunggah tetapi gagal disimpan ke database (best effort). */
export async function removeFiles(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try { await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove(list); } catch { /* abaikan */ }
}
