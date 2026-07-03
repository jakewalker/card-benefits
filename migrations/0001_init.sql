-- Card Benefits Tracker — initial schema.
-- Portable SQLite: no D1-specific features here.

CREATE TABLE cards (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  issuer           TEXT,
  annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  anniversary_date TEXT NOT NULL,                    -- 'YYYY-MM-DD' card open/renewal date
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  closed_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE benefits (
  id             TEXT PRIMARY KEY,
  card_id        TEXT NOT NULL REFERENCES cards(id),
  name           TEXT NOT NULL,
  description    TEXT,
  value_cents    INTEGER,                            -- display only (e.g. "$15 Uber Cash"); not usage tracking
  frequency      TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','semiannual','annual')),
  anchor         TEXT NOT NULL CHECK (anchor IN ('calendar','anniversary')),
  automatic      INTEGER NOT NULL DEFAULT 0,         -- 1 = posts automatically (auto-checked each cycle)
  active         INTEGER NOT NULL DEFAULT 1,         -- 0 = discontinued; history retained
  start_date     TEXT NOT NULL,                      -- clamps history enumeration (defaults to date added)
  deactivated_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_benefits_card ON benefits(card_id);

-- Lazily created: a row exists only once the user checks/unchecks or comments.
-- used: NULL = inherit default (benefit.automatic); 1/0 = explicit user state.
CREATE TABLE benefit_usage (
  id         TEXT PRIMARY KEY,
  benefit_id TEXT NOT NULL REFERENCES benefits(id),
  cycle_key  TEXT NOT NULL,
  used       INTEGER,
  comment    TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (benefit_id, cycle_key)
);
CREATE INDEX idx_usage_benefit ON benefit_usage(benefit_id);
