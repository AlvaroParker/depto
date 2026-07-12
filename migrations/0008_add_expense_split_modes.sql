ALTER TABLE expenses
ADD COLUMN split_mode TEXT NOT NULL DEFAULT 'equal'
CHECK (split_mode IN ('equal', 'custom', 'open'));
