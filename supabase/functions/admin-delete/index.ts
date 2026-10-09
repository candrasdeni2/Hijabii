import { handle, isUuid, strictKeys } from '../_shared/http.ts';
import { HttpError } from '../_shared/auth.ts';

// Hanya akun berperan admin yang boleh dihapus lewat fungsi ini.
handle(['super_admin'], async ({ body, admin, user }) => {
  strictKeys(body, ['user_id']);
  const { user_id } = body;
  if (!isUuid(user_id)) throw new HttpError(422, 'invalid_input', 'user_id tidak valid.');
  if (user_id === user.id) throw new HttpError(403, 'self_not_allowed', 'Tidak bisa menghapus akun sendiri.');

  const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).maybeSingle();
  if (!target) throw new HttpError(404, 'user_not_found', 'Admin tidak ditemukan.');
  if (target.role !== 'admin') throw new HttpError(403, 'forbidden', 'Hanya akun admin yang bisa dihapus di sini.');

  await admin.rpc('revoke_user_sessions', { p_user: user_id });
  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) {
    console.error('deleteUser failed:', error.message);
    throw new HttpError(409, 'delete_failed', 'Admin tidak bisa dihapus (mungkin masih terkait data). Nonaktifkan saja.');
  }
  await admin.from('activity_logs').insert({
    actor_id: user.id, action: 'admin_deleted', target_type: 'profile', target_id: null, meta: { deleted_id: user_id },
  });
  return { user_id };
});
