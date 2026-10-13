// Pencarian area ongkir (asal kirim di Pengaturan, tujuan kirim di checkout).
// Kunci API ongkir hanya ada di Edge Function; browser cukup memanggil function ini.
import { invokeFn } from "./api.js";

/** @returns {Promise<Array<{id:string,label:string,province:?string,city:?string,district:?string,subdistrict:?string,postal_code:?string}>>} */
export async function searchAreas(q, limit = 10) {
  const query = String(q ?? "").trim();
  if (query.length < 3) return [];
  const data = await invokeFn("shipping-area-search", { q: query, limit });
  return data?.areas ?? [];
}
