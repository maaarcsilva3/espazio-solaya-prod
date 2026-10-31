-- Custom booking statuses.
-- Replaces the fixed request_status enum with the request_statuses table.
-- Safe to run more than once, and a no-op on databases created from the current 01_schema.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS request_statuses (
  key        TEXT PRIMARY KEY,
  label      VARCHAR(60) NOT NULL,
  bg         CHAR(7) NOT NULL,
  text_color CHAR(7) NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('new', 'booked', 'closed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT request_statuses_default_is_new CHECK (NOT is_default OR category = 'new')
);

CREATE UNIQUE INDEX IF NOT EXISTS request_statuses_one_default ON request_statuses (is_default) WHERE is_default;

DO $$
DECLARE
  saved JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM request_statuses) THEN
    RETURN;
  END IF;

  -- Carry over colors chosen in the dashboard's earlier Settings page, if any.
  IF to_regclass('app_settings') IS NOT NULL THEN
    EXECUTE $q$SELECT value FROM app_settings WHERE key = 'status_colors'$q$ INTO saved;
  END IF;
  saved := COALESCE(saved, '{}'::jsonb);

  INSERT INTO request_statuses (key, label, bg, text_color, category, sort_order, is_default)
  SELECT s.key, s.label,
         COALESCE(saved -> s.key ->> 'bg', s.bg),
         COALESCE(saved -> s.key ->> 'text', '#ffffff'),
         s.category, s.sort_order, s.key = 'pending'
    FROM (VALUES
      ('pending',   'Pending',   '#f59e0b', 'new',    1),
      ('confirmed', 'Confirmed', '#10b981', 'booked', 2),
      ('completed', 'Completed', '#6366f1', 'closed', 3),
      ('rejected',  'Rejected',  '#ef4444', 'closed', 4),
      ('cancelled', 'Cancelled', '#64748b', 'closed', 5)
    ) AS s(key, label, bg, category, sort_order);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'booking_requests'
       AND column_name = 'status' AND udt_name = 'request_status'
  ) THEN
    ALTER TABLE booking_requests ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE booking_requests ALTER COLUMN status TYPE TEXT USING status::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'booking_requests_status_fkey' AND conrelid = 'booking_requests'::regclass
  ) THEN
    ALTER TABLE booking_requests
      ADD CONSTRAINT booking_requests_status_fkey
      FOREIGN KEY (status) REFERENCES request_statuses(key) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DROP TYPE IF EXISTS request_status;
DROP TABLE IF EXISTS app_settings;

COMMIT;
