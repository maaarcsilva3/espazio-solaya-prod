-- Assignable agents. Separate from admins, who are the people who can log in.
-- Idempotent: safe to re-run. Also applied on fresh volumes via init/05_agents.sql.

CREATE TABLE IF NOT EXISTS agents (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(255),
  phone      VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agents_name_lower_idx ON agents (lower(name));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'inquiry_agents'
       AND column_name = 'admin_id'
  ) THEN
    DROP TABLE IF EXISTS inquiry_agents_new;

    INSERT INTO agents (name, email)
    SELECT DISTINCT a.name, a.email
      FROM inquiry_agents ia
      JOIN admins a ON a.id = ia.admin_id
     WHERE NOT EXISTS (
       SELECT 1 FROM agents g WHERE lower(g.name) = lower(a.name)
     );

    CREATE TABLE inquiry_agents_new (
      inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      agent_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      PRIMARY KEY (inquiry_id, agent_id)
    );

    INSERT INTO inquiry_agents_new (inquiry_id, agent_id)
    SELECT DISTINCT ia.inquiry_id, g.id
      FROM inquiry_agents ia
      JOIN admins a ON a.id = ia.admin_id
      JOIN agents g ON lower(g.name) = lower(a.name);

    DROP TABLE inquiry_agents;
    ALTER TABLE inquiry_agents_new RENAME TO inquiry_agents;
  END IF;
END $$;
