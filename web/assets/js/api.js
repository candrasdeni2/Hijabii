// Pemanggil Edge Function bersama. Mengerti dua format respons:
//   lama (superadmin-users)  : sukses { ok:true, ...field }      galat { error: "pesan" }
//   baru (handle() _shared)  : sukses { ok:true, data:{...} }    galat { ok:false, error:{ code, message } }
import { supabase } from "./supabase.js";

export class ApiError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const GENERIC = "Terjadi kesalahan. Coba lagi.";

/** Ambil pesan galat dari payload respons (format lama atau baru). */
export function messageFromPayload(payload) {
  const e = payload?.error;
  if (!e) return null;
  if (typeof e === "string") return e;
  return e.message ?? GENERIC;
}

/** Ubah error dari supabase.functions.invoke menjadi ApiError berpesan Indonesia. */
export async function toApiError(error, fnName) {
  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError")
    return new ApiError(`Tidak dapat menghubungi server. Pastikan Edge Function ${fnName} sudah di-deploy.`, { code: "unreachable" });
  let payload = null;
  try { payload = await error.context.json(); } catch { /* bukan JSON */ }
  const status = error?.context?.status ?? null;
  return new ApiError(messageFromPayload(payload) ?? GENERIC, { code: payload?.error?.code ?? null, status });
}

/** Ambil isi sukses dari payload (format baru -> payload.data; format lama -> payload apa adanya). */
export function unwrap(payload) {
  if (payload && payload.ok === true && "data" in payload) return payload.data;
  return payload;
}

export async function invokeFn(name, body = {}) {
  if (!supabase) throw new ApiError("Aplikasi belum dikonfigurasi.", { code: "not_configured" });
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await toApiError(error, name);
  const msg = messageFromPayload(data);
  if (msg || data?.ok === false) throw new ApiError(msg ?? GENERIC, { code: data?.error?.code ?? null });
  return unwrap(data);
}
