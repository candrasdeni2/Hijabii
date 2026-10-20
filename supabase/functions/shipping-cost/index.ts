// Edge Function: shipping-cost
// Hitung ongkir dari asal kirim (Pengaturan) ke area tujuan. Berat dihitung SERVER dari varian yang dikirim (bukan angka dari klien).
// Body: { destination: "<id area>", courier: "pos"|"jnt"|"jne", items: [{variant_id, qty}], fresh?: boolean }
// Hasil: { weight_gram, courier, services:[{service,description,cost,etd}], cached, stale, fetched_at }
// fresh:true melewati cache (dipakai saat membuat pesanan agar harga selalu terbaru).
import { handle, strictKeys } from '../_shared/http.ts';
import { adminClient, HttpError } from '../_shared/auth.ts';
import { fetchRates, getRates, RateError, shippingWeight, type Key, type Row, type Service, type Store } from './calc.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COURIERS = ['pos', 'jnt', 'jne'];

function dbStore(admin: ReturnType<typeof adminClient>): Store {
  const match = (q: any, k: Key) =>
    q.eq('origin_area_id', k.origin).eq('destination_area_id', k.destination).eq('weight_gram', k.weight).eq('courier', k.courier);
  const row = (d: any): Row | null => (d ? { services: d.services as Service[], fetched_at: d.fetched_at } : null);
  return {
    async get(k, maxAgeMs) {
      const since = new Date(Date.now() - maxAgeMs).toISOString();
      const { data } = await match(admin.from('shipping_rate_cache').select('services, fetched_at'), k).gte('fetched_at', since).maybeSingle();
      return row(data);
    },
    async getAny(k) {
      const { data } = await match(admin.from('shipping_rate_cache').select('services, fetched_at'), k).maybeSingle();
      return row(data);
    },
    async put(k, services) {
      const { error } = await admin.from('shipping_rate_cache').upsert({
        origin_area_id: k.origin, destination_area_id: k.destination, weight_gram: k.weight, courier: k.courier, services, fetched_at: new Date().toISOString(),
      }, { onConflict: 'origin_area_id,destination_area_id,weight_gram,courier' });
      if (error) console.error('cache put gagal:', error.message);     // cache hanya pelengkap: jangan gagalkan permintaan
    },
  };
}

handle(['customer', 'admin', 'super_admin'], async ({ body }) => {
  strictKeys(body, ['destination', 'courier', 'items', 'fresh']);
  const destination = String(body.destination ?? '');
  const courier = String(body.courier ?? '');
  if (!/^\d{1,12}$/.test(destination)) throw new HttpError(422, 'invalid_input', 'Area tujuan tidak valid.');
  if (!COURIERS.includes(courier)) throw new HttpError(422, 'invalid_input', 'Kurir tidak dikenal.');
  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw new HttpError(422, 'invalid_input', 'Item pesanan tidak valid.');
  const qtyBy = new Map<string, number>();
  for (const it of items as Array<Record<string, unknown>>) {
    const vid = String(it?.variant_id ?? ''), qty = it?.qty;
    if (!UUID.test(vid) || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 999) throw new HttpError(422, 'invalid_input', 'Item pesanan tidak valid.');
    qtyBy.set(vid, (qtyBy.get(vid) ?? 0) + qty);
  }

  const admin = adminClient();
  const { data: s } = await admin.from('settings').select('origin_area_id, packaging_buffer_gram, weight_round_gram').eq('id', true).maybeSingle();
  if (!s?.origin_area_id) throw new HttpError(422, 'origin_not_set', 'Asal kirim belum diatur di Pengaturan.');

  const vids = [...qtyBy.keys()];
  const { data: vs } = await admin.from('product_variants').select('id, product_id').in('id', vids);
  if ((vs?.length ?? 0) !== vids.length) throw new HttpError(422, 'variant_not_found', 'Ada varian yang tidak ditemukan. Muat ulang daftar produk.');
  const { data: ps } = await admin.from('products').select('id, weight_gram').in('id', [...new Set(vs!.map((v) => v.product_id))]);
  const w = new Map((ps ?? []).map((p) => [p.id, p.weight_gram as number]));
  let grams = 0;
  for (const v of vs!) grams += (w.get(v.product_id) ?? 0) * (qtyBy.get(v.id) ?? 0);
  const weight = shippingWeight(grams, s.packaging_buffer_gram, s.weight_round_gram);

  const apiKey = Deno.env.get('RAJAONGKIR_API_KEY');
  if (!apiKey) throw new HttpError(503, 'shipping_not_configured', 'Layanan ongkir belum dikonfigurasi. Hubungi admin.');
  const key: Key = { origin: String(s.origin_area_id), destination, weight, courier };
  try {
    const r = await getRates({ key, fresh: body.fresh === true, store: dbStore(admin), live: () => fetchRates({ key: apiKey, ...key }) });
    return { weight_gram: weight, courier, ...r };
  } catch (e) {
    if (!(e instanceof RateError)) throw e;
    if (e.kind === 'auth') throw new HttpError(502, 'shipping_auth', 'Kunci API ongkir ditolak. Hubungi pengembang.');
    if (e.kind === 'quota') throw new HttpError(429, 'shipping_rate_limited', 'Kuota cek ongkir hari ini habis. Isi ongkir manual.');
    if (e.kind === 'unreachable') throw new HttpError(504, 'shipping_unreachable', 'Layanan ongkir tidak merespons. Isi ongkir manual.');
    throw new HttpError(502, 'shipping_error', 'Layanan ongkir sedang bermasalah. Isi ongkir manual.');
  }
});
