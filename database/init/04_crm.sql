-- CRM pipelines, inquiries, inventory quantity, and activity history.
-- Safe to run more than once. Init scripts only run on an empty volume;
-- on an existing database apply this file manually:
--   docker compose exec -T postgres psql -U booking -d booking < init/04_crm.sql

BEGIN;

ALTER TABLE offerings ADD COLUMN IF NOT EXISTS quantity INTEGER;
UPDATE offerings SET quantity = 1 WHERE quantity IS NULL;
ALTER TABLE offerings ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE offerings ALTER COLUMN quantity SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offerings_quantity_positive') THEN
    ALTER TABLE offerings ADD CONSTRAINT offerings_quantity_positive CHECK (quantity >= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                 SERIAL PRIMARY KEY,
  pipeline           TEXT NOT NULL CHECK (pipeline IN ('event_venue', 'room_booking')),
  label              VARCHAR(60) NOT NULL,
  bg                 CHAR(7) NOT NULL,
  text_color         CHAR(7) NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  outcome            TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'won', 'lost')),
  reserves_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_label_lower_idx
  ON pipeline_stages (pipeline, lower(label));

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_won_idx
  ON pipeline_stages (pipeline) WHERE outcome = 'won';

INSERT INTO pipeline_stages (pipeline, label, bg, text_color, sort_order, outcome, reserves_inventory)
SELECT v.pipeline, v.label, v.bg, v.text_color, v.sort_order, v.outcome, v.reserves_inventory
  FROM (VALUES
    ('event_venue', 'Inquiry',                  '#f59e0b', '#ffffff', 1, 'open', FALSE),
    ('event_venue', 'Qualify',                  '#3b82f6', '#ffffff', 2, 'open', FALSE),
    ('event_venue', 'Discovery Call',           '#8b5cf6', '#ffffff', 3, 'open', FALSE),
    ('event_venue', 'Waiting for Confirmation', '#f97316', '#ffffff', 4, 'open', FALSE),
    ('event_venue', 'Confirmed Leads',          '#10b981', '#ffffff', 5, 'won',  TRUE),
    ('room_booking', 'Inquiry',                  '#f59e0b', '#ffffff', 1, 'open', FALSE),
    ('room_booking', 'Qualify',                  '#3b82f6', '#ffffff', 2, 'open', FALSE),
    ('room_booking', 'Waiting for Confirmation', '#f97316', '#ffffff', 3, 'open', FALSE),
    ('room_booking', 'Confirmed Leads',          '#10b981', '#ffffff', 4, 'won',  TRUE)
  ) AS v(pipeline, label, bg, text_color, sort_order, outcome, reserves_inventory)
 WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.pipeline = v.pipeline);

CREATE TABLE IF NOT EXISTS inquiries (
  id                  SERIAL PRIMARY KEY,
  pipeline            TEXT NOT NULL CHECK (pipeline IN ('event_venue', 'room_booking')),
  stage_id            INTEGER NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  customer_name       VARCHAR(160) NOT NULL,
  phone               VARCHAR(40),
  email               VARCHAR(255) NOT NULL,
  lead_source         TEXT NOT NULL CHECK (lead_source IN (
                        'website', 'facebook', 'instagram', 'social_media', 'referral', 'walk_in', 'other'
                      )),
  lead_source_detail  VARCHAR(200),
  offering_id         INTEGER REFERENCES offerings(id) ON DELETE RESTRICT,
  event_type          VARCHAR(120),
  guests              INTEGER CHECK (guests IS NULL OR guests >= 0),
  start_at            TIMESTAMP,
  end_at              TIMESTAMP,
  cocktail_time       TIME,
  accommodation_date  DATE,
  special_requests    TEXT,
  additional_services TEXT,
  custom_arrangements TEXT,
  internal_notes      TEXT,
  package_price       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (package_price >= 0),
  additional_charges  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (additional_charges >= 0),
  discounts           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discounts >= 0),
  discount_percent    NUMERIC(5, 2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  other_fees          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (other_fees >= 0),
  final_agreed_price  NUMERIC(12, 2) CHECK (final_agreed_price IS NULL OR final_agreed_price >= 0),
  deposit_amount      NUMERIC(12, 2) CHECK (deposit_amount IS NULL OR deposit_amount >= 0),
  deposit_note        TEXT,
  converted_at        TIMESTAMPTZ,
  stage_entered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inquiries_range_valid CHECK (start_at IS NULL OR end_at IS NULL OR end_at > start_at),
  CONSTRAINT inquiries_quote_nonnegative CHECK (
    package_price + additional_charges + other_fees - discounts >= 0
  )
);

CREATE INDEX IF NOT EXISTS inquiries_pipeline_stage_idx ON inquiries (pipeline, stage_id);
CREATE INDEX IF NOT EXISTS inquiries_offering_idx ON inquiries (offering_id);
CREATE INDEX IF NOT EXISTS inquiries_created_idx ON inquiries (created_at);
CREATE INDEX IF NOT EXISTS inquiries_dates_idx ON inquiries (start_at, end_at);

DROP TRIGGER IF EXISTS inquiries_updated_at ON inquiries;
CREATE TRIGGER inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION inquiries_stage_pipeline() RETURNS trigger AS $$
DECLARE
  stage_pipeline TEXT;
BEGIN
  SELECT pipeline INTO stage_pipeline FROM pipeline_stages WHERE id = NEW.stage_id;
  IF stage_pipeline IS DISTINCT FROM NEW.pipeline THEN
    RAISE EXCEPTION 'stage does not belong to this pipeline';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inquiries_stage_pipeline ON inquiries;
CREATE TRIGGER inquiries_stage_pipeline
  BEFORE INSERT OR UPDATE OF stage_id, pipeline ON inquiries
  FOR EACH ROW EXECUTE FUNCTION inquiries_stage_pipeline();

CREATE TABLE IF NOT EXISTS inquiry_agents (
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  PRIMARY KEY (inquiry_id, admin_id)
);

CREATE TABLE IF NOT EXISTS inquiry_stage_events (
  id          SERIAL PRIMARY KEY,
  inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  stage_id    INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  stage_label VARCHAR(60) NOT NULL,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS inquiry_stage_events_inquiry_idx
  ON inquiry_stage_events (inquiry_id, entered_at);

CREATE TABLE IF NOT EXISTS inquiry_price_events (
  id                 SERIAL PRIMARY KEY,
  inquiry_id         INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  admin_id           INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  package_price      NUMERIC(12, 2) NOT NULL,
  additional_charges NUMERIC(12, 2) NOT NULL,
  discounts          NUMERIC(12, 2) NOT NULL,
  other_fees         NUMERIC(12, 2) NOT NULL,
  total_quoted       NUMERIC(12, 2) NOT NULL,
  final_agreed_price NUMERIC(12, 2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_price_events_inquiry_idx
  ON inquiry_price_events (inquiry_id, created_at);

CREATE TABLE IF NOT EXISTS site_visits (
  id           SERIAL PRIMARY KEY,
  inquiry_id   INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  notes        TEXT,
  outcome      TEXT,
  created_by   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_visits_inquiry_idx ON site_visits (inquiry_id, scheduled_at);

DROP TRIGGER IF EXISTS site_visits_updated_at ON site_visits;
CREATE TRIGGER site_visits_updated_at
  BEFORE UPDATE ON site_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS inquiry_activities (
  id         SERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_activities_inquiry_idx
  ON inquiry_activities (inquiry_id, created_at);

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

INSERT INTO offerings (name, type, description, capacity, price, price_unit, quantity)
SELECT v.name, v.type::offering_type, v.description, v.capacity, v.price, v.price_unit, v.quantity
  FROM (VALUES
    ('Event Hall', 'event_place_only', 'Event hall.', NULL::integer, NULL::numeric, 'per event', 1),
    ('Couple Villa Premium', 'room_only', 'Couple villa with mini pool.', 2, NULL::numeric, 'per night', 1),
    ('Couple Villa Regular', 'room_only', 'Couple villa without mini pool.', 2, NULL::numeric, 'per night', 1),
    ('Dorm Villa (6-8 pax)', 'room_only', 'Dormitory villa for 6-8 guests.', 8, NULL::numeric, 'per night', 1),
    ('Dorm Villa (4-6 pax)', 'room_only', 'Dormitory villas for 4-6 guests each.', 6, NULL::numeric, 'per night', 4),
    ('Family Villa', 'room_only', 'Family villa for 10-15 guests.', 15, NULL::numeric, 'per night', 1)
  ) AS v(name, type, description, capacity, price, price_unit, quantity)
 WHERE NOT EXISTS (SELECT 1 FROM offerings o WHERE lower(o.name) = lower(v.name));

COMMIT;
