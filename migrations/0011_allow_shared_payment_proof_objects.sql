ALTER TABLE expense_shares ADD COLUMN bulk_payment_id TEXT;

CREATE INDEX idx_expense_shares_bulk_payment
  ON expense_shares(bulk_payment_id)
  WHERE bulk_payment_id IS NOT NULL;

DROP TRIGGER payment_proofs_require_paid_insert;

DROP TRIGGER payment_proofs_require_paid_update;

DROP TRIGGER paid_share_requires_proof_removal;

ALTER TABLE expense_share_payment_proofs RENAME TO expense_share_payment_proofs_old;

CREATE TABLE expense_share_payment_proofs (
  share_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL CHECK (length(trim(filename)) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by_user_id TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (share_id) REFERENCES expense_shares(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO expense_share_payment_proofs
  (share_id, object_key, filename, content_type, size_bytes, uploaded_by_user_id, uploaded_at)
SELECT share_id, object_key, filename, content_type, size_bytes, uploaded_by_user_id, uploaded_at
FROM expense_share_payment_proofs_old;

DROP TABLE expense_share_payment_proofs_old;

CREATE INDEX idx_payment_proofs_uploaded_by
  ON expense_share_payment_proofs(uploaded_by_user_id);

CREATE INDEX idx_payment_proofs_object_key
  ON expense_share_payment_proofs(object_key);

CREATE TRIGGER payment_proofs_require_paid_insert
BEFORE INSERT ON expense_share_payment_proofs
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM expense_shares
  WHERE id = NEW.share_id AND status = 'paid'
)
BEGIN
  SELECT RAISE(ABORT, 'payment proof requires a paid share');
END;

CREATE TRIGGER payment_proofs_require_paid_update
BEFORE UPDATE ON expense_share_payment_proofs
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM expense_shares
  WHERE id = NEW.share_id AND status = 'paid'
)
BEGIN
  SELECT RAISE(ABORT, 'payment proof requires a paid share');
END;

CREATE TRIGGER paid_share_requires_proof_removal
BEFORE UPDATE OF status ON expense_shares
FOR EACH ROW
WHEN NEW.status <> 'paid'
  AND EXISTS (
    SELECT 1 FROM expense_share_payment_proofs
    WHERE share_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'remove payment proof before leaving paid state');
END;
