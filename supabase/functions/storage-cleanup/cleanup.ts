// Logika pembersihan antrean hapus file Storage. Sengaja tanpa impor apa pun agar mudah diuji di luar Deno.
// Alur per batch: baca antrean -> buang entri tak sah -> lewati file yang MASIH dipakai tabel -> hapus sisanya dari bucket -> hapus baris antrean.
// Idempoten: file yang sudah tidak ada dianggap berhasil. Kegagalan di Storage membuat barisnya tetap di antrean untuk dicoba lagi.

export const BUCKET = 'hijabii-images';
// Hanya path berbentuk folder/nama.ext (huruf, angka, / _ . -), tanpa "..".
const SAFE_PATH = /^(?!.*\.\.)[a-z0-9][a-z0-9/_.-]*$/i;
// Tabel + kolom yang menyimpan path foto. Bila kelak ada tabel foto baru, tambahkan di sini.
const REFERENCES: Array<[string, string]> = [['product_colors', 'image_path'], ['product_color_images', 'image_path'], ['lookbooks', 'image_path']];

export class CleanupError extends Error {}

type Row = { id: number; bucket: string; path: string };
// deno-lint-ignore no-explicit-any
type Admin = any;

export type Report = { deleted: number; in_use: number; invalid: number; failed: number; batches: number; remaining: number | null };

async function runBatch(admin: Admin, batch: number) {
  const { data, error } = await admin.from('storage_delete_queue').select('id, bucket, path').order('id').limit(batch);
  if (error) throw new CleanupError('Gagal membaca antrean.');
  const rows = (data ?? []) as Row[];
  const r = { n: rows.length, deleted: 0, in_use: 0, invalid: 0, failed: 0 };
  if (!rows.length) return r;

  const valid = rows.filter((x) => x.bucket === BUCKET && SAFE_PATH.test(x.path));
  const drop = new Set<number>(rows.filter((x) => !valid.includes(x)).map((x) => x.id));   // entri tak sah tak akan pernah jadi file sah
  r.invalid = drop.size;

  const paths = [...new Set(valid.map((x) => x.path))];
  const used = new Set<string>();
  if (paths.length) {
    for (const [table, col] of REFERENCES) {
      const { data: refs, error: e } = await admin.from(table).select(col).in(col, paths);
      if (e) throw new CleanupError('Gagal memeriksa pemakaian foto.');   // ragu = jangan hapus apa pun
      for (const ref of refs ?? []) used.add(ref[col]);
    }
  }
  const removable = paths.filter((p) => !used.has(p));
  const stillUsed = valid.filter((x) => used.has(x.path));
  stillUsed.forEach((x) => drop.add(x.id));
  r.in_use = stillUsed.length;

  if (removable.length) {
    const { error: e } = await admin.storage.from(BUCKET).remove(removable);
    if (e) r.failed = removable.length;                                   // baris tetap di antrean
    else {
      valid.filter((x) => !used.has(x.path)).forEach((x) => drop.add(x.id));
      r.deleted = removable.length;
    }
  }
  if (drop.size) {
    const { error: e } = await admin.from('storage_delete_queue').delete().in('id', [...drop]);
    if (e) throw new CleanupError('File sudah dihapus tetapi antrean gagal dibersihkan. Akan dicoba lagi.');
  }
  return r;
}

export async function cleanupQueue(admin: Admin, { batch = 100, maxBatches = 5 } = {}): Promise<Report> {
  const rep: Report = { deleted: 0, in_use: 0, invalid: 0, failed: 0, batches: 0, remaining: null };
  for (let i = 0; i < maxBatches; i++) {
    const r = await runBatch(admin, batch);
    if (!r.n) break;
    rep.batches++; rep.deleted += r.deleted; rep.in_use += r.in_use; rep.invalid += r.invalid; rep.failed += r.failed;
    if (r.failed || r.n < batch) break;     // gagal -> berhenti (coba lagi di jadwal berikutnya); antrean habis -> selesai
  }
  const { count } = await admin.from('storage_delete_queue').select('id', { count: 'exact', head: true });
  rep.remaining = count ?? null;
  return rep;
}
