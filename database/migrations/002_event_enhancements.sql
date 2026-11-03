-- Event inquiry enhancements: cocktail/accommodation, discount %, attachments.
-- Idempotent: safe to re-run. Mirrored in init/04_crm.sql for fresh volumes.

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS cocktail_time TIME,
  ADD COLUMN IF NOT EXISTS accommodation_date DATE,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inquiries_discount_percent_range'
  ) THEN
    ALTER TABLE inquiries
      ADD CONSTRAINT inquiries_discount_percent_range
      CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
  END IF;
END $$;

-- Normalize common free-text event types before optional app validation.
UPDATE inquiries
   SET event_type = 'Corporate'
 WHERE event_type IS NOT NULL
   AND lower(trim(event_type)) IN ('corporate', 'corp', 'company', 'business');

UPDATE inquiries
   SET event_type = 'Wedding'
 WHERE event_type IS NOT NULL
   AND lower(trim(event_type)) IN ('wedding', 'weddings');

UPDATE inquiries
   SET event_type = 'Socials'
 WHERE event_type IS NOT NULL
   AND lower(trim(event_type)) IN (
     'social', 'socials', 'birthday', 'debut', 'anniversary', 'party', 'gathering'
   );

CREATE TABLE IF NOT EXISTS inquiry_attachments (
  id            SERIAL PRIMARY KEY,
  inquiry_id    INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('qualify', 'payment')),
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_attachments_inquiry_idx
  ON inquiry_attachments (inquiry_id, kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_attachments_stored_name_idx
  ON inquiry_attachments (stored_name);
