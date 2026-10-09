#!/usr/bin/env bash
# Menjalankan schema + RLS di PostgreSQL LOKAL dengan stub Supabase, untuk uji Fase 1.
# Prasyarat: PostgreSQL 15+ berjalan, dan user yang dipakai boleh membuat database.
# Pakai:  PGUSER=postgres bash supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${DB:-hijabii_test}
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/_harness/00_supabase_stub.sql supabase/migrations/001_schema.sql \
         supabase/migrations/002_rls.sql supabase/migrations/003_patches.sql; do
  echo ">> $f"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null
done
for f in supabase/tests/rls_*.sql supabase/tests/flow_*.sql; do   # diisi di Fase 1 (tugas 1.1 dan 1.2)
  [ -e "$f" ] || continue; echo ">> uji $f"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "Selesai: $DB siap."
