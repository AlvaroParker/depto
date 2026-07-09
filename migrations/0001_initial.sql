PRAGMA foreign_keys = ON;

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  slug TEXT NOT NULL UNIQUE CHECK (slug = lower(slug)),
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (username = lower(trim(username))),
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  participant_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_app_users_participant
  ON app_users(participant_id)
  WHERE participant_id IS NOT NULL;

CREATE TABLE login_attempts (
  scope TEXT NOT NULL CHECK (scope IN ('username', 'ip')),
  key_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX idx_login_attempts_locked_until ON login_attempts(locked_until);
CREATE INDEX idx_login_attempts_updated_at ON login_attempts(updated_at);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'CLP'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  expense_date TEXT NOT NULL CHECK (
    length(expense_date) = 10
    AND expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  paid_by_participant_id TEXT NOT NULL,
  receipt_object_key TEXT,
  receipt_filename TEXT CHECK (receipt_filename IS NULL OR length(receipt_filename) <= 255),
  receipt_content_type TEXT CHECK (
    receipt_content_type IS NULL
    OR receipt_content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  receipt_size_bytes INTEGER CHECK (
    receipt_size_bytes IS NULL OR receipt_size_bytes BETWEEN 1 AND 10485760
  ),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (receipt_object_key IS NULL AND receipt_filename IS NULL
      AND receipt_content_type IS NULL AND receipt_size_bytes IS NULL)
    OR
    (receipt_object_key IS NOT NULL AND receipt_filename IS NOT NULL
      AND receipt_content_type IS NOT NULL AND receipt_size_bytes IS NOT NULL)
  ),
  FOREIGN KEY (paid_by_participant_id) REFERENCES participants(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_expenses_active_date
  ON expenses(deleted_at, expense_date DESC, created_at DESC);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_participant_id);
CREATE INDEX idx_expenses_name_search ON expenses(lower(name));

CREATE TABLE expense_shares (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  share_amount_minor INTEGER NOT NULL CHECK (share_amount_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('settled', 'pending', 'paid')),
  paid_to_participant_id TEXT,
  paid_at TEXT,
  marked_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'settled' AND paid_to_participant_id IS NULL
      AND paid_at IS NULL AND marked_by_user_id IS NULL)
    OR
    (status = 'pending' AND paid_to_participant_id IS NOT NULL
      AND paid_at IS NULL AND marked_by_user_id IS NULL)
    OR
    (status = 'paid' AND paid_to_participant_id IS NOT NULL
      AND paid_at IS NOT NULL AND marked_by_user_id IS NOT NULL)
  ),
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE RESTRICT,
  FOREIGN KEY (paid_to_participant_id) REFERENCES participants(id) ON DELETE RESTRICT,
  FOREIGN KEY (marked_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  UNIQUE (expense_id, participant_id)
);

CREATE INDEX idx_expense_shares_expense ON expense_shares(expense_id);
CREATE INDEX idx_expense_shares_participant ON expense_shares(participant_id);
CREATE INDEX idx_expense_shares_status ON expense_shares(status);
CREATE INDEX idx_expense_shares_paid_to ON expense_shares(paid_to_participant_id);
