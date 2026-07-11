-- Email belongs to the participant identity represented by each regular user.
-- Existing participants remain nullable until an administrator supplies their address.

ALTER TABLE participants ADD COLUMN email TEXT COLLATE NOCASE
  CHECK (
    email IS NULL OR (
      length(email) BETWEEN 3 AND 254
      AND email = lower(trim(email))
    )
  );

CREATE UNIQUE INDEX idx_participants_email
ON participants(email)
WHERE email IS NOT NULL;
