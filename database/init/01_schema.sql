-- Booking management schema

CREATE TYPE offering_type AS ENUM (
  'event_place_with_rooms',
  'event_place_only',
  'room_only',
  'amenity'
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE admins (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE offerings (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  type        offering_type NOT NULL,
  description TEXT,
  capacity    INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  price       NUMERIC(12, 2) CHECK (price IS NULL OR price >= 0),
  price_unit  VARCHAR(40),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER offerings_updated_at
  BEFORE UPDATE ON offerings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Booking statuses are managed from the dashboard. The category tells the app how to treat each one:
-- new = needs action, booked = confirmed booking, closed = finished or declined.
CREATE TABLE request_statuses (
  key        TEXT PRIMARY KEY,
  label      VARCHAR(60) NOT NULL,
  bg         CHAR(7) NOT NULL,
  text_color CHAR(7) NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('new', 'booked', 'closed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT request_statuses_default_is_new CHECK (NOT is_default OR category = 'new')
);

-- Only one status can be given to new website requests.
CREATE UNIQUE INDEX request_statuses_one_default ON request_statuses (is_default) WHERE is_default;

INSERT INTO request_statuses (key, label, bg, text_color, category, sort_order, is_default) VALUES
  ('pending',   'Pending',   '#f59e0b', '#ffffff', 'new',    1, TRUE),
  ('confirmed', 'Confirmed', '#10b981', '#ffffff', 'booked', 2, FALSE),
  ('completed', 'Completed', '#6366f1', '#ffffff', 'closed', 3, FALSE),
  ('rejected',  'Rejected',  '#ef4444', '#ffffff', 'closed', 4, FALSE),
  ('cancelled', 'Cancelled', '#64748b', '#ffffff', 'closed', 5, FALSE);

CREATE TABLE booking_requests (
  id          SERIAL PRIMARY KEY,
  full_name   VARCHAR(160) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  phone       VARCHAR(40),
  offering_id INTEGER REFERENCES offerings(id) ON DELETE RESTRICT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  guests      INTEGER CHECK (guests IS NULL OR guests >= 0),
  event_type  VARCHAR(120),
  message     TEXT,
  status      TEXT NOT NULL REFERENCES request_statuses(key) ON UPDATE CASCADE ON DELETE RESTRICT,
  admin_notes TEXT,
  source      VARCHAR(40) NOT NULL DEFAULT 'website',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX booking_requests_status_idx ON booking_requests (status);
CREATE INDEX booking_requests_dates_idx ON booking_requests (start_date, end_date);
CREATE INDEX booking_requests_offering_idx ON booking_requests (offering_id);

CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_request_amenities (
  request_id  INTEGER NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  offering_id INTEGER NOT NULL REFERENCES offerings(id) ON DELETE RESTRICT,
  PRIMARY KEY (request_id, offering_id)
);
