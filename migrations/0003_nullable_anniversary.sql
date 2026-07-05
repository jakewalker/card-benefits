-- Allow a card's anniversary_date to be NULL ("fill in later" — chiefly for
-- no-fee cards we don't want to chase a renewal date for). SQLite can't drop a
-- NOT NULL constraint in place, so rebuild the table (12-step ALTER). D1 does
-- not enforce foreign keys by default, so benefits.card_id references survive
-- the swap because ids are preserved.
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
