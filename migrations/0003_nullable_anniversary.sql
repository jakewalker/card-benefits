-- Allow a card's anniversary_date to be NULL ("fill in later" — chiefly for
-- no-fee cards we don't want to chase a renewal date for). SQLite can't drop a
-- NOT NULL constraint in place, so rebuild the table (12-step ALTER).
--
-- Remote D1 enforces foreign keys, so dropping `cards` while `benefits`
-- references it fails. Disable FK enforcement for the rebuild; the end state
-- is consistent (cards keeps the same ids benefits reference), then re-enable.
--
-- NOTE: `wrangler d1 migrations apply` wraps each migration in a transaction,
-- where PRAGMA foreign_keys is a no-op — so on a POPULATED db this migration
-- fails there (it's fine on an empty db: no rows to violate). The production db
-- already had data, so this was applied out-of-band via
--   wrangler d1 execute --remote --file <this rebuild>   (autocommit; pragma honored)
-- and its row inserted into d1_migrations manually. Fresh/local envs apply it
-- normally via `migrations apply`.
PRAGMA foreign_keys = OFF;

CREATE TABLE cards_new (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  issuer           TEXT,
  annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  anniversary_date TEXT,                             -- 'YYYY-MM-DD' or NULL (unknown yet)
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  closed_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO cards_new (id, name, issuer, annual_fee_cents, anniversary_date, status, closed_at, created_at)
  SELECT id, name, issuer, annual_fee_cents, anniversary_date, status, closed_at, created_at FROM cards;

DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;

PRAGMA foreign_keys = ON;
