import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from './config.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'sira.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT CHECK (role IN ('tenant', 'owner')),
  phone TEXT UNIQUE,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  whatsapp TEXT,
  name TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  available INTEGER NOT NULL DEFAULT 1,
  kyc_status TEXT NOT NULL DEFAULT 'none',      -- none | pending | verified | rejected
  kyc_id_type TEXT,
  kyc_id_last4 TEXT,
  kyc_id_enc TEXT,                              -- encrypted full ID number
  kyc_file TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0,         -- registration finished; role can then be switched freely
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,                        -- email | phone
  target TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS otps_target ON otps(channel, target);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rent INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  booking_amount INTEGER NOT NULL,
  furnishing TEXT NOT NULL DEFAULT 'unfurnished',
  amenities TEXT NOT NULL DEFAULT '[]',
  district TEXT NOT NULL,
  area TEXT NOT NULL,
  landmark TEXT NOT NULL,
  location_enc TEXT NOT NULL,                   -- encrypted {address, lat, lng}; never sent publicly
  approx_lat REAL NOT NULL,                     -- offset point for public maps
  approx_lng REAL NOT NULL,
  doc_type TEXT,
  doc_file TEXT,
  verification TEXT NOT NULL DEFAULT 'pending', -- pending | verified
  status TEXT NOT NULL DEFAULT 'active',        -- active | withdrawn
  available_from TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS properties_category ON properties(category, status);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,                           -- interior | exterior
  sha256 TEXT,
  position INTEGER NOT NULL,
  card_url TEXT,                                -- ~720px version for cards ('' = could not be made)
  large_url TEXT,                               -- ~1440px version for the gallery
  thumbhash TEXT                                -- tiny blurred preview shown while loading
);
CREATE INDEX IF NOT EXISTS photos_property ON photos(property_id, position);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,                        -- unlock | booking | district_pass
  property_id TEXT REFERENCES properties(id),   -- NULL for district passes
  booking_id TEXT,
  district TEXT,                                -- district passes only
  amount INTEGER NOT NULL,                      -- paise
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL,                       -- mock | razorpay
  provider_order_id TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',       -- created | paid | failed
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  fulfilment_failed INTEGER NOT NULL DEFAULT 0,
  refund_status TEXT,                           -- under_review | refunded | rejected
  refund_reason TEXT,                           -- duplicate | technical | withdrawn | wrong_details
  refund_note TEXT,
  provider_refund_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

-- Each unlock opens one property's owner contact for 6 months.
CREATE TABLE IF NOT EXISTS unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  method TEXT NOT NULL,                         -- payment | pass | credit
  payment_id TEXT,
  pass_id TEXT,
  credit_id TEXT,
  unlocked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  report_deadline TEXT NOT NULL,                -- "Report Wrong Details" allowed until (48 h)
  status TEXT NOT NULL DEFAULT 'active',        -- active | reported
  reported_at TEXT,
  report_reason TEXT,
  report_resolution TEXT,                       -- refund | credit | pass_credit | credit_returned
  review_status TEXT,                           -- pending | approved | rejected | auto_credit (money refunds only)
  review_deadline TEXT,                         -- after this an unreviewed refund becomes a free credit
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,                        -- email | console
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS district_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  district TEXT NOT NULL,                       -- one of the 38 Tamil Nadu districts
  payment_id TEXT NOT NULL UNIQUE,
  credits_total INTEGER NOT NULL,
  activated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS district_passes_user ON district_passes(user_id, district);

-- One row per pass credit spent; returned_at is set when a wrong-details report gives the credit back.
CREATE TABLE IF NOT EXISTS pass_unlocks (
  pass_id TEXT NOT NULL REFERENCES district_passes(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  unlock_id TEXT NOT NULL,
  used_at TEXT NOT NULL,
  returned_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS pass_unlocks_once ON pass_unlocks(pass_id, property_id) WHERE returned_at IS NULL;

-- Free single-unlock credits (from wrong-details reports).
CREATE TABLE IF NOT EXISTS unlock_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_unlock_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT,
  used_unlock_id TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  amount INTEGER NOT NULL,                      -- rupees
  move_in_date TEXT NOT NULL,                   -- YYYY-MM-DD
  end_date TEXT NOT NULL,                       -- YYYY-MM-DD, exclusive
  duration_months INTEGER NOT NULL,
  status TEXT NOT NULL,                         -- PENDING_PAYMENT | CONFIRMED | EXPIRED | FAILED | CANCELLED
  hold_expires_at INTEGER,
  payment_id TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS bookings_property ON bookings(property_id, status);
CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  tenant_id TEXT NOT NULL REFERENCES users(id),
  sender_id TEXT,                               -- NULL for system notes
  kind TEXT NOT NULL DEFAULT 'text',            -- text | missed_call
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_by_tenant INTEGER NOT NULL DEFAULT 0,
  read_by_owner INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(property_id, tenant_id, created_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_property ON reviews(property_id);
`);

// Migration for databases created before Tenant ⇄ Owner switching existed.
if (!db.prepare("SELECT 1 AS ok FROM pragma_table_info('users') WHERE name = 'onboarded'").get()) {
  db.exec('ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0');
}
db.exec(`UPDATE users SET onboarded = 1
          WHERE onboarded = 0 AND role IS NOT NULL AND phone_verified = 1 AND (role = 'tenant' OR kyc_status <> 'none')`);

// Categories are now Homes, Apartments, Villas, PG, Room Sharing — the old "Rooms" category folds into Room Sharing.
db.exec("UPDATE properties SET category = 'room_sharing' WHERE category = 'rooms'");

const hasColumn = (table, column) =>
  Boolean(db.prepare(`SELECT 1 AS ok FROM pragma_table_info('${table}') WHERE name = ?`).get(column));

function migrate(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Migration: payments may now be for a District Pass (no property), so property_id becomes nullable.
if (!hasColumn('payments', 'district')) {
  migrate(() =>
    db.exec(`
      ALTER TABLE payments RENAME TO payments_legacy;
      CREATE TABLE payments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL,
        property_id TEXT REFERENCES properties(id), booking_id TEXT, district TEXT, amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR', provider TEXT NOT NULL, provider_order_id TEXT, provider_payment_id TEXT,
        status TEXT NOT NULL DEFAULT 'created', is_duplicate INTEGER NOT NULL DEFAULT 0, fulfilment_failed INTEGER NOT NULL DEFAULT 0,
        refund_status TEXT, refund_reason TEXT, refund_note TEXT, provider_refund_id TEXT, created_at TEXT NOT NULL, paid_at TEXT
      );
      INSERT INTO payments (id, user_id, purpose, property_id, booking_id, amount, currency, provider, provider_order_id,
          provider_payment_id, status, is_duplicate, fulfilment_failed, refund_status, refund_reason, refund_note,
          provider_refund_id, created_at, paid_at)
        SELECT id, user_id, purpose, property_id, booking_id, amount, currency, provider, provider_order_id,
          provider_payment_id, status, is_duplicate, fulfilment_failed, refund_status, refund_reason, refund_note,
          provider_refund_id, created_at, paid_at
        FROM payments_legacy;
      DROP TABLE payments_legacy;
    `),
  );
}

// Migration: unlocks now expire after 6 months and can be reported. Earlier (₹9) unlocks keep their
// original unlock date, so they expire 6 months after it.
if (!hasColumn('unlocks', 'id')) {
  migrate(() =>
    db.exec(`
      ALTER TABLE unlocks RENAME TO unlocks_legacy;
      CREATE TABLE unlocks (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), property_id TEXT NOT NULL REFERENCES properties(id),
        method TEXT NOT NULL, payment_id TEXT, pass_id TEXT, credit_id TEXT, unlocked_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        report_deadline TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', reported_at TEXT, report_reason TEXT,
        report_resolution TEXT
      );
      INSERT INTO unlocks (id, user_id, property_id, method, payment_id, unlocked_at, expires_at, report_deadline)
        SELECT lower(hex(randomblob(16))), user_id, property_id, 'payment', payment_id, created_at,
          strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+6 months'),
          strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+48 hours')
        FROM unlocks_legacy;
      DROP TABLE unlocks_legacy;
    `),
  );
}

// Migration: smaller photo versions + blurred previews for slow networks.
for (const column of ['card_url', 'large_url', 'thumbhash']) {
  if (!hasColumn('photos', column)) db.exec(`ALTER TABLE photos ADD COLUMN ${column} TEXT`);
}

// Migration: admin review of "wrong details" money refunds.
for (const column of ['review_status', 'review_deadline', 'reviewed_at', 'reviewed_by']) {
  if (!hasColumn('unlocks', column)) db.exec(`ALTER TABLE unlocks ADD COLUMN ${column} TEXT`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS payments_order ON payments(provider_order_id);
  CREATE INDEX IF NOT EXISTS unlocks_user_property ON unlocks(user_id, property_id, status);
`);

const statements = new Map();
function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = db.prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

export const one = (sql, ...params) => stmt(sql).get(...params);
export const all = (sql, ...params) => stmt(sql).all(...params);
export const run = (sql, ...params) => stmt(sql).run(...params);

/** Runs a synchronous function inside a write transaction (serialises concurrent bookings). */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
