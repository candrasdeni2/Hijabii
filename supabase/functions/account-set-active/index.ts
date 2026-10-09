import { handle, isUuid, strictKeys } from '../_shared/http.ts';
import { HttpError } from '../_shared/auth.ts';

handle(['super_admin'], async ({ body, admin, user }) => {
  strictKeys(body, ['user_id', 'is_active']);
  const { user_id, is_active } = body;
  if (!isUuid(user_id)) throw new HttpError(422, 'invalid_input', 'user_id tidak valid.');
  if (typeof is_active !== 'boolean') throw new HttpError(422, 'invalid_input', 'is_active harus boolean.');
  if (user_id === user.id) throw new HttpError(403, 'self_not_allowed', 'Tidak bisa menonaktifkan akun sendiri.');

  const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).maybeSingle();
  if (!target) throw new HttpError(404, 'user_not_found', 'User tidak ditemukan.');
  if (!['customer', 'admin'].includes(target.role)) throw new HttpError(403, 'forbidden', 'Peran target tidak boleh diubah.');

  const { error: e1 } = await admin.from('profiles').update({ is_active }).eq('id', user_id);
  if (e1) { console.error(e1.message); throw new HttpError(500, 'internal', 'Gagal mengubah status akun.'); }

  const { error: e2 } = await admin.auth.admin.updateUserById(user_id, { ban_duration: is_active ? 'none' : '876000h' });
  if (e2) {
    await admin.from('profiles').update({ is_active: !is_active }).eq('id', user_id); // rollback
    console.error(e2.message); throw new HttpError(500, 'internal', 'Gagal mengubah status akun.');
  }
  if (!is_active) await admin.rpc('revoke_user_sessions', { p_user: user_id }); // putus akses langsung

  await admin.from('activity_logs').insert({
    actor_id: user.id, action: is_active ? 'account_activated' : 'account_deactivated',
    target_type: 'profile', target_id: user_id, meta: {},
  });
  return { user_id, is_active };
});
