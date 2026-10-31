# Booking Database (PostgreSQL)

Runs PostgreSQL 16 via the parent Compose file (private network; host port bound to `127.0.0.1` only).

Data files live on the **host** under `database/data/` (or `POSTGRES_DATA_DIR`), not in a Docker named volume.

## Setup

```bash
cd ..
cp .env.example .env      # set a strong POSTGRES_PASSWORD
mkdir -p database/data
docker compose up -d
docker compose ps         # wait until postgres is "healthy"
```

On the **first** start (empty data directory) Postgres runs every file in `init/` in order:

- `01_schema.sql` - tables, enums, indexes, triggers
- `02_seed.sql` - sample offerings (delete this file before the first start if you do not want them)
- `03_custom_statuses.sql` - editable `request_statuses`
- `04_crm.sql` - CRM pipelines
- `05_agents.sql` - agents directory

## Later schema changes

Init scripts do not re-run when `database/data` already has a cluster. Add a file under `migrations/` and apply it:

```bash
./database/migrate.sh
```

See [migrations/README.md](migrations/README.md).

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_USER` | `admin` | Database user |
| `POSTGRES_PASSWORD` | (required) | Strong password |
| `POSTGRES_DB` | `espazio_booking_system` | Database name |
| `POSTGRES_HOST_PORT` | `5437` | Loopback-only host port |
| `POSTGRES_DATA_DIR` | `./database/data` | Host folder mounted as Postgres data |
| `TZ` | `UTC` | Server time zone |

**Note:** Changing `POSTGRES_PASSWORD` in `.env` does not update an existing data directory. Alter the role inside Postgres (or wipe `POSTGRES_DATA_DIR`) after rotating.

The dashboard container connects with hostname `postgres` and port `5432`. From the host machine use `127.0.0.1` and `POSTGRES_HOST_PORT`.

## Migrating from the old Docker volume

If you previously used the external volume `database_pgdata`:

```bash
docker compose down
# copy out of the old volume into the new host folder (example)
mkdir -p database/data
docker run --rm -v database_pgdata:/from -v "$(pwd)/database/data:/to" alpine \
  sh -c 'cd /from && cp -a . /to/'
docker compose up -d
# optional: docker volume rm database_pgdata
```

## Backup / restore

Schedule `pg_dump` regularly in production (or back up the whole `database/data` folder while Postgres is stopped):

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup.sql
```

## Reset (deletes all data)

```bash
docker compose down
rm -rf database/data/*
mkdir -p database/data
docker compose up -d --build
```
