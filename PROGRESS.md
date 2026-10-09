# Progres pengembangan

Acuan: `docs/timeline.md` (estimasi ±30%, mulai Sen 12 Okt 2026, 1 developer).

## Fase 0 — Persiapan dan fondasi (12–16 Okt 2026)

| Tugas | Status | Catatan |
|---|---|---|
| 0.1 Project Supabase/GitHub/Vercel, jalankan schema + RLS | **Menunggu kamu** | Langkah di README. Skema + RLS sudah lulus di PostgreSQL lokal (19 tabel, 0 tanpa RLS, idempotent) |
| 0.3 Cek kuota, API ongkir (Kantor Pos), kandidat SMTP | **Menunggu kamu** | Keputusan #1, #2, #3 |
| 0.4 Fondasi frontend | Selesai (kode) | Token, klien Supabase, penjaga login/peran, pemetaan status, komponen dasar. Perlu uji visual di browser |
| 0.5 Super admin pertama + data contoh | Siap dijalankan | `supabase/seed/`. Teruji di DB lokal |

## Berikutnya: Fase 1 — Backend (19–30 Okt)
1.1 uji RLS 4 peran → 1.2 uji alur RPC/trigger → 1.3 tambal celah (butuh keputusan #4–#7) → 1.4 kode bersama Edge Function → 1.5 lima Edge Function akun → 1.6 cron, keepalive, SMTP.
