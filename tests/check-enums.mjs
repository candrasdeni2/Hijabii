// Memastikan slug di web/assets/js/labels.js persis sama dengan enum di schema.sql (design.md 13.4).
import { readFileSync } from 'node:fs';
import * as L from '../web/assets/js/labels.js';
const sql = readFileSync(new URL('../supabase/migrations/001_schema.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');  // buang komentar dulu (ada tanda kurung di dalamnya)
const enumOf = (t) => {
  const m = sql.match(new RegExp(`create type ${t}\\s+as enum \\(([^)]*)\\)`, 's'));
  if (!m) throw new Error(`enum ${t} tidak ditemukan di schema`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
};
const pairs = { order_status:L.ORDER_STATUS, payment_status:L.PAYMENT_STATUS, courier_type:L.COURIER,
  shipping_pay_method:L.SHIPPING_PAY_METHOD, product_pay_method:L.PRODUCT_PAY_METHOD, cancel_reason:L.CANCEL_REASON,
  product_status:L.PRODUCT_STATUS, user_role:L.ROLE, notification_type:L.NOTIFICATION_TYPE };
let bad = 0;
for (const [t, map] of Object.entries(pairs)) {
  const a = enumOf(t), b = Object.keys(map).sort(), same = JSON.stringify(a) === JSON.stringify(b);
  console.log(same ? 'ok  ' : 'BEDA', t, same ? '' : `schema=[${a}] labels=[${b}]`); if (!same) bad++;
}
process.exit(bad ? 1 : 0);
