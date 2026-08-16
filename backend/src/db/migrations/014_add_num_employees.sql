-- Add company employee count to lead records.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS num_employees INTEGER;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_num_employees_nonnegative;

ALTER TABLE leads
  ADD CONSTRAINT leads_num_employees_nonnegative
  CHECK (num_employees IS NULL OR num_employees >= 0);

CREATE INDEX IF NOT EXISTS idx_leads_num_employees
  ON leads (num_employees)
  WHERE num_employees IS NOT NULL;
