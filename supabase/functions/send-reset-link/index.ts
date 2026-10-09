import { handle, isUuid, strictKeys } from '../_shared/http.ts';
import { HttpError, anonClient } from '../_shared/auth.ts';

handle(['super_admin'], async ({ body, admin, user }) => {
  strictKeys(body, ['user_id']);
  const { user_id } = body;
  if (!isUuid(user_id)) throw new HttpError(422, 'invalid_input', 'user_id tidak valid.');
  if (user_id === user.id) throw new HttpError(403, 'self_not_allowed', 'Gunakan "Lupa password" untuk akun sendiri.');

  const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).maybeSingle();
  if (!target) throw new HttpError(404, 'user_not_found', 'User tidak ditemukan.');
  if (!['customer', 'admin'].includes(target.role)) throw new HttpError(403, 'forbidden', 'Peran target tidak boleh diubah.');

  const { data: au, error } = await admin.auth.admin.getUserById(user_id);
  if (error || !au.user?.email) throw new HttpError(404, 'user_not_found', 'Email user tidak ditemukan.');

  const { error: e2 } = await anonClient().auth.resetPasswordForEmail(au.user.email, {
    redirectTo: `${Deno.env.get('SITE_URL')}/reset-password`, // sesuaikan dengan peta URL
  });
  if (e2) { console.error('reset failed:', e2.message); throw new HttpError(502, 'mail_failed', 'Link reset gagal dikirim. Coba lagi atau ganti password manual.'); }

  await admin.from('activity_logs').insert({
    actor_id: user.id, action: 'reset_link_sent', target_type: 'profile', target_id: user_id, meta: {},
  });
  return { sent: true };
});
