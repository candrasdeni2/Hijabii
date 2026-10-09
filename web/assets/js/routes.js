// routes.js — peta URL halaman (keputusan #9 timeline). Dilengkapi bertahap; dipakai redirect peran & tautan push.
export const ROUTES = {
  login:          '/auth/login.html',          // dibuat di 2.1
  changePassword: '/auth/ganti-password.html', // dibuat di 2.1
  home: { customer:'/toko/', admin:'/admin/', super_admin:'/superadmin/' },
};
export const roleHome = (role) => ROUTES.home[role] ?? '/';
