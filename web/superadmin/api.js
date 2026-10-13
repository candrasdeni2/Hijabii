// Pemanggil Edge Function "superadmin-users" (operasi yang butuh service role: buat/hapus/nonaktifkan akun, ganti password).
import { invokeFn } from "../assets/js/api.js";

export const callFn = (action, payload = {}) => invokeFn("superadmin-users", { action, ...payload });