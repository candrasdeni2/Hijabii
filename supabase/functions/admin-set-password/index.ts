import { handle, isUuid, strictKeys } from '../_shared/http.ts';
import { HttpError } from '../_shared/auth.ts';
import { checkPassword, generatePassword } from '../_shared/password.ts';
import { sendMail } from '../_shared/mail.ts';

handle(['super_admin'], async ({ body, admin, user }) => {
  strictKeys(body, ['user_id', 'mode', 'password']);
  const { user_id, mode } = body;
  if (!isUuid(user_id)) throw new HttpError(422, 'invalid_input', 'user_id tidak valid.');
  if (mode !== 'manual' && mode !== 'generate') throw new HttpError(422, 'invalid_input', 'mode tidak valid.');
  if (user_id === user.id) throw new HttpError(403, 'self_not_allowed', 'Tidak bisa mengganti password akun sendiri di sini.');

  const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).maybeSingle();
  if (!target) throw new HttpError(404, 'user_not_found', 'User tidak ditemukan.');
  if (!['customer', 'admin'].includes(target.role)) throw new HttpError(403, 'forbidden', 'Peran target tidak boleh diubah.');

  const password = mode === 'manual' ? checkPassword(body.password) : generatePassword();

  // 1. set password (gagal di sini = tidak ada yang berubah)
  const { data: au, error } = await admin.auth.admin.updateUserById(user_id, { password });
  if (error || !au.user) { console.error('updateUser failed:', error?.message); throw new HttpError(500, 'internal', 'Gagal mengganti password.'); }

  // 2-4 berurutan
  const steps: Array<[string, () => Promise<{ error: { message: string } | null }>]> = [
    ['profile', async () => await admin.from('profiles')
      .update({ must_change_password: true, password_reset_notice_at: new Date().toISOString() }).eq('id', user_id)],
    ['sessions', async () => await admin.rpc('revoke_user_sessions', { p_user: user_id })],
    ['notif', async () => await admin.from('notifications').insert({
      user_id, type: 'password_diubah', title: 'Password kamu diubah',
      body: 'Password akunmu diubah oleh admin. Bukan kamu? Hubungi admin lewat WhatsApp.', data: {} })],
  ];
  for (const [name, run] of steps) {
    const { error: e } = await run();
    if (e) { console.error(`step ${name} failed:`, e.message); throw new HttpError(500, 'internal', 'Password diganti, tetapi ada langkah lanjutan yang gagal. Periksa akun target.'); }
  }

  let mail_sent = false;
  try {
    mail_sent = await sendMail(au.user.email!, 'Password akun Hijabii diubah',
      `Password akunmu diubah pada ${new Date().toISOString()}. Bukan kamu? Hubungi admin lewat WhatsApp.`);
  } catch (e) { console.error('mail failed:', (e as Error).message); }

  await admin.from('activity_logs').insert({
    actor_id: user.id, action: 'password_changed', target_type: 'profile', target_id: user_id, meta: { mode },
  });
  return { password, mail_sent }; // tampil sekali
});
