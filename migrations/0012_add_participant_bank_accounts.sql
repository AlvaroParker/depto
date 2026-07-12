CREATE TABLE participant_bank_accounts (
  participant_id TEXT PRIMARY KEY,
  rut TEXT NOT NULL CHECK (length(trim(rut)) BETWEEN 3 AND 16),
  account_type TEXT NOT NULL CHECK (
    account_type IN ('Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro')
  ),
  account_number TEXT NOT NULL CHECK (length(trim(account_number)) BETWEEN 1 AND 64),
  bank_name TEXT NOT NULL CHECK (length(trim(bank_name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);
