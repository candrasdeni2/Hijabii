// Adapter API ongkir. Satu-satunya tempat yang tahu soal RajaOngkir (Komerce) V2.
// Ganti provider (mis. Biteship) cukup dengan mengubah berkas ini; function lain tidak ikut berubah.
// Secret yang dibutuhkan: RAJAONGKIR_API_KEY  (supabase secrets set RAJAONGKIR_API_KEY=...)
import { HttpError } from './auth.ts';

const BASE = 'https://rajaongkir.komerce.id/api/v1';
const TIMEOUT_MS = 8000;

export type Area = {
  id: string;
  label: string;
  province: string | null;
  city: string | null;
  district: string | null;
  subdistrict: string | null;
  postal_code: string | null;
};

// Cache di memori per instance: menghemat jatah 100 hit/hari paket Starter.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; areas: Area[] }>();

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;

function apiKey(): string {
  const k = Deno.env.get('RAJAONGKIR_API_KEY');
  if (!k) throw new HttpError(503, 'shipping_not_configured', 'Layanan ongkir belum dikonfigurasi. Hubungi admin.');
  return k;
}

/** Cari area (kota/kecamatan/kelurahan/kode pos). ID hasilnya dipakai sebagai origin_area_id / destination_area_id. */
export async function searchAreas(query: string, limit = 10): Promise<Area[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  const ck = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.areas;

  const url = `${BASE}/destination/domestic-destination?search=${encodeURIComponent(q)}&limit=${limit}&offset=0`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { key: apiKey() }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(504, 'shipping_unreachable', 'Layanan ongkir tidak merespons. Coba lagi sebentar.');
  }

  if (res.status === 401 || res.status === 403)
    throw new HttpError(502, 'shipping_auth', 'Kunci API ongkir ditolak. Hubungi admin.');
  if (res.status === 429)
    throw new HttpError(429, 'shipping_rate_limited', 'Batas pencarian ongkir hari ini tercapai. Coba lagi besok.');

  const json = await res.json().catch(() => null) as { data?: unknown } | null;
  // "Data not found" bisa datang sebagai 404 atau 200 dengan data kosong: dua-duanya = hasil kosong.
  if (res.status === 404) return remember(ck, []);
  if (!res.ok || !json) throw new HttpError(502, 'shipping_error', 'Layanan ongkir sedang bermasalah. Coba lagi sebentar.');

  const rows = Array.isArray(json.data) ? json.data as Record<string, unknown>[] : [];
  const areas: Area[] = rows
    .map((r) => ({
      id: str(r.id) ?? '',
      label: str(r.label) ?? '',
      province: str(r.province_name),
      city: str(r.city_name),
      district: str(r.district_name),
      subdistrict: str(r.subdistrict_name),
      postal_code: str(r.zip_code),
    }))
    .filter((a) => a.id && a.label);
  return remember(ck, areas);
}

function remember(key: string, areas: Area[]): Area[] {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), areas });
  return areas;
}
