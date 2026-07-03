-- Benefit display categories. Existing rows default to 'other'.
ALTER TABLE benefits ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('dining','hotels','travel','shopping','entertainment','other'));
