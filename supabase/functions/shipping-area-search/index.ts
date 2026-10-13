// Edge Function: shipping-area-search
// Cari area (kota/kecamatan/kode pos) untuk asal kirim (admin) dan tujuan kirim (customer saat checkout).
// Body: { q: string (3-60 huruf), limit?: 1-15 }  ->  { ok:true, data:{ areas:[{id,label,province,city,district,subdistrict,postal_code}] } }
import { handle, strictKeys } from '../_shared/http.ts';
import { HttpError } from '../_shared/auth.ts';
import { searchAreas } from '../_shared/shipping.ts';

handle(['customer', 'admin', 'super_admin'], async ({ body }) => {
  strictKeys(body, ['q', 'limit']);
  const q = typeof body.q === 'string' ? body.q.trim() : '';
  if (q.length < 3 || q.length > 60)
    throw new HttpError(422, 'invalid_input', 'Ketik minimal 3 huruf untuk mencari area.');
  const raw = body.limit;
  const limit = typeof raw === 'number' && Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 15) : 10;
  return { areas: await searchAreas(q, limit) };
});
