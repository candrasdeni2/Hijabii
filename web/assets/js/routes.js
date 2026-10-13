// Deteksi folder dasar otomatis:
// XAMPP -> '/HIjabii/web' | Vercel (web/ jadi root) -> ''
const i = location.pathname.indexOf('/web/');
export const BASE = i >= 0 ? location.pathname.slice(0, i + 4) : '';

export const ROUTES = {
  login:          `${BASE}/auth/login.html`,
  forgotPassword: `${BASE}/auth/lupa-password.html`,
  changePassword: `${BASE}/auth/ganti-password.html`,
  home: {
    customer:    `${BASE}/toko/`,
    admin:       `${BASE}/admin/`,
    super_admin: `${BASE}/superadmin/`,
  },
};

export const roleHome = (role) => ROUTES.home[role] ?? ROUTES.home.customer;