# Database migrations

`database/init/` runs **only** when the Postgres data volume is empty (first boot).

Later schema changes go here as numbered, forward-only SQL files:

1. Add `00N_description.sql`
2. With Postgres running: `./database/migrate.sh` from the repo root

The migrate script records applied files in `schema_migrations` and skips ones already applied.

Fresh volumes still get the baseline from `init/` (including `05_agents.sql`). `001_agents.sql` is the same agents change for existing databases that predate that init script.

Do **not** rely on the Node app to CREATE/ALTER/DROP tables at boot.
