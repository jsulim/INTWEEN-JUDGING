#!/usr/bin/env bash
# 로컬 Postgres 16으로 마이그레이션 적용 + RLS·트리거·뷰 시나리오 검증 (QA Q1·Q3·Q4·Q6·Q7 등)
# 사용: npm run test:db   (postgres 바이너리 필요. root 환경이면 postgres 사용자로 실행)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-$((20000 + RANDOM % 20000))}
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="sudo -u postgres"; command -v sudo >/dev/null || RUN="runuser -u postgres --"; fi
$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
trap '$RUN "$PGBIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null"
$PSQL -c "create database t" postgres
$PSQL -f tests/db/supabase_stub.sql t
for f in supabase/migrations/*.sql; do $PSQL -f "$f" t; done
$PSQL -f tests/db/rls_test.sql t
echo "DB tests passed"
