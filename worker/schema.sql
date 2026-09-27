CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_id TEXT NOT NULL CHECK (service_id IN ('transfer', 'numerology')),
  service_name TEXT NOT NULL,
  booking_date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'needs_information', 'rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON bookings(status, booking_date);
