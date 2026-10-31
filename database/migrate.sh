#!/usr/bin/env sh
# Forward-only SQL migrations against the Compose Postgres service.
# Usage (from repo root): ./database/migrate.sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/database/migrations"
COMPOSE="docker compose -f ${ROOT}/docker-compose.yml"

if ! $COMPOSE ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "Postgres service is not running. Start it with: docker compose up -d postgres" >&2
  exit 1
fi

$COMPOSE exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"'

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  id="$(basename "$file")"
  applied="$(
    $COMPOSE exec -T postgres sh -c \
      "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT 1 FROM schema_migrations WHERE id = '${id}'\"" \
      | tr -d '[:space:]'
  )"
  if [ "$applied" = "1" ]; then
    echo "skip  $id"
    continue
  fi
  echo "apply $id"
  $COMPOSE exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
  $COMPOSE exec -T postgres sh -c \
    "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO schema_migrations (id) VALUES ('${id}')\""
done

echo "Migrations complete."
