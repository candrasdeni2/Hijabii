// Logika hitung ongkir tanpa impor (mudah diuji di luar Deno): berat kirim, panggilan API, saring layanan, dan cache dengan cadangan basi.

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;      // harga dianggap segar 24 jam
const BASE = 'https://rajaongkir.komerce.id/api/v1';
// Layanan khusus yang bukan pilihan pengiriman biasa (mis. Pos mengembalikan Dangerous Goods dan Valuable Goods).
const HIDDEN_SERVICE = /dangerous goods|valuable goods/i;

export type Service = { service: string; description: string | null; cost: number; etd: string | null };
export type Key = { origin: string; destination: string; weight: number; courier: string };
export type Row = { services: Service[]; fetched_at: string };
export type Store = {
  get(k: Key, maxAgeMs: number): Promise<Row | null>;
  getAny(k: Key): Promise<Row | null>;
  put(k: Key, services: Service[]): Promise<void>;
};

export class RateError extends Error {
  constructor(public kind: 'auth' | 'quota' | 'unreachable' | 'upstream', message: string) { super(message); }
}

/** Berat kirim = (berat produk + buffer kemasan sekali per pesanan), dibulatkan ke atas ke kelipatan `round` gram. */
export const shippingWeight = (productGram: number, buffer: number, round: number) =>
  Math.ceil((productGram + buffer) / round) * round;

/** Ubah isi `data` dari API menjadi daftar layanan bersih, tersaring, dan terurut dari yang termurah. */
export function normalizeServices(rows: unknown): Service[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[])
    .map((r) => ({
      service: String(r.service ?? '').trim(),
      description: r.description ? String(r.description) : null,
      cost: Number(r.cost),
      etd: r.etd ? String(r.etd) : null,
    }))
    .filter((s) => s.service && Number.isFinite(s.cost) && s.cost >= 0 && !HIDDEN_SERVICE.test(s.service))
    .sort((a, b) => a.cost - b.cost);
}

export async function fetchRates(
  { key, origin, destination, weight, courier, fetchFn = fetch, timeoutMs = 8000 }:
  { key: string; origin: string; destination: string; weight: number; courier: string; fetchFn?: typeof fetch; timeoutMs?: number },
): Promise<Service[]> {
  let res: Response;
  try {
    res = await fetchFn(`${BASE}/calculate/domestic-cost`, {
      method: 'POST',
      headers: { key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ origin, destination, weight: String(weight), courier }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RateError('unreachable', 'Layanan ongkir tidak merespons.');
  }
  const json = await res.json().catch(() => null) as { meta?: { message?: string }; data?: unknown } | null;
  const msg = String(json?.meta?.message ?? '');
  // Urutan penting: pesan "Invalid Api key, key not found" juga memuat "not found".
  if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw new RateError('auth', 'Kunci API ongkir ditolak.');
  if (res.status === 429 || /rate limit|quota|too many|exceed/i.test(msg)) throw new RateError('quota', 'Batas cek ongkir tercapai.');
  if (!res.ok) {
    if (/not found/i.test(msg)) return [];                     // kurir tidak punya layanan untuk rute/berat ini
    throw new RateError('upstream', 'Layanan ongkir bermasalah.');
  }
  return normalizeServices(json?.data);
}

/**
 * Cache dulu (bila belum kedaluwarsa). Bila API gagal (kuota/jaringan/server) dan ada harga lama, pakai itu dengan penanda stale.
 * Kunci API yang salah tidak ditutupi dengan cache, supaya masalah konfigurasi tetap terlihat.
 */
export async function getRates(
  { key, fresh = false, store, live, now = () => Date.now() }:
  { key: Key; fresh?: boolean; store: Store; live: () => Promise<Service[]>; now?: () => number },
) {
  if (!fresh) {
    const hit = await store.get(key, CACHE_TTL_MS);
    if (hit) return { services: hit.services, cached: true, stale: false, fetched_at: hit.fetched_at };
  }
  try {
    const services = await live();
    if (services.length) await store.put(key, services);       // hasil kosong tidak disimpan
    return { services, cached: false, stale: false, fetched_at: new Date(now()).toISOString() };
  } catch (e) {
    if (e instanceof RateError && e.kind !== 'auth') {
      const old = await store.getAny(key);
      if (old) return { services: old.services, cached: true, stale: true, fetched_at: old.fetched_at };
    }
    throw e;
  }
}
