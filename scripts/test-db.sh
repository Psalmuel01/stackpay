#!/usr/bin/env bash
# Applies every migration to a throwaway local PostgreSQL instance and runs the
# SQL tests in supabase/tests. Supabase-specific roles and auth.role() are
# stubbed so the schema, constraints and functions can be exercised offline.
#
# Usage: scripts/test-db.sh [test-file.sql ...]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl)")}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stackpay-pg.XXXXXX")"
PORT="${PGPORT_TEST:-$((20000 + RANDOM % 10000))}"
LOG="$DATA_DIR/postgres.log"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR -c listen_addresses=''" -l "$LOG" -w start >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PG_BIN/psql" -h "$DATA_DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -c "create database stackpay_test" >/dev/null
PSQL+=(-d stackpay_test)

"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'service_role')
$$;
SQL

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$migration")"
  "${PSQL[@]}" -f "$migration" >/dev/null
done

if [ "$#" -gt 0 ]; then tests=("$@"); else tests=("$ROOT"/supabase/tests/*.sql); fi
failed=0
for test in "${tests[@]}"; do
  if "${PSQL[@]}" -f "$test" >/dev/null 2>"$DATA_DIR/err"; then
    echo "pass     $(basename "$test")"
  else
    echo "FAIL     $(basename "$test")"; sed 's/^/         /' "$DATA_DIR/err"; failed=1
  fi
done
exit $failed
