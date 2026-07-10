-- Regular application users and participants are the same household identity.
-- Keep historical participant rows for old expenses, but only participants linked
-- to active regular users remain available for new expenses.

UPDATE app_users
SET participant_id = NULL
WHERE role <> 'user' AND participant_id IS NOT NULL;

WITH missing_users AS (
  SELECT
    id,
    display_name,
    created_at,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS position
  FROM app_users
  WHERE role = 'user' AND participant_id IS NULL
),
current_order AS (
  SELECT COALESCE(MAX(sort_order), 0) AS maximum FROM participants
)
INSERT INTO participants (id, name, slug, sort_order, active, created_at, updated_at)
SELECT
  'participant-user-' || missing_users.id,
  missing_users.display_name,
  lower('user-' || missing_users.id),
  current_order.maximum + missing_users.position,
  0,
  missing_users.created_at,
  missing_users.created_at
FROM missing_users
CROSS JOIN current_order;

UPDATE app_users
SET participant_id = 'participant-user-' || id
WHERE role = 'user' AND participant_id IS NULL;

UPDATE participants
SET
  name = COALESCE(
    (SELECT display_name FROM app_users WHERE participant_id = participants.id AND role = 'user'),
    name
  ),
  active = CASE WHEN EXISTS (
    SELECT 1
    FROM app_users
    WHERE participant_id = participants.id
      AND role = 'user'
      AND disabled_at IS NULL
  ) THEN 1 ELSE 0 END,
  updated_at = COALESCE(
    (SELECT updated_at FROM app_users WHERE participant_id = participants.id AND role = 'user'),
    updated_at
  );

CREATE TRIGGER app_users_validate_participant_insert
BEFORE INSERT ON app_users
FOR EACH ROW
WHEN (NEW.role = 'user' AND NEW.participant_id IS NULL)
  OR (NEW.role <> 'user' AND NEW.participant_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'regular users require a participant and privileged users cannot have one');
END;

CREATE TRIGGER app_users_validate_participant_update
BEFORE UPDATE OF role, participant_id ON app_users
FOR EACH ROW
WHEN (NEW.role = 'user' AND NEW.participant_id IS NULL)
  OR (NEW.role <> 'user' AND NEW.participant_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'regular users require a participant and privileged users cannot have one');
END;

CREATE TRIGGER app_users_sync_participant_insert
AFTER INSERT ON app_users
FOR EACH ROW
WHEN NEW.role = 'user'
BEGIN
  UPDATE participants
  SET name = NEW.display_name,
      active = CASE WHEN NEW.disabled_at IS NULL THEN 1 ELSE 0 END,
      updated_at = NEW.updated_at
  WHERE id = NEW.participant_id;
END;

CREATE TRIGGER app_users_sync_participant_update
AFTER UPDATE OF display_name, disabled_at, participant_id, role ON app_users
FOR EACH ROW
BEGIN
  UPDATE participants
  SET active = CASE WHEN EXISTS (
        SELECT 1 FROM app_users
        WHERE participant_id = OLD.participant_id
          AND role = 'user'
          AND disabled_at IS NULL
      ) THEN 1 ELSE 0 END,
      updated_at = NEW.updated_at
  WHERE id = OLD.participant_id;
  UPDATE participants
  SET name = NEW.display_name,
      active = CASE WHEN NEW.role = 'user' AND NEW.disabled_at IS NULL THEN 1 ELSE 0 END,
      updated_at = NEW.updated_at
  WHERE id = NEW.participant_id AND NEW.role = 'user';
END;

CREATE TRIGGER app_users_sync_participant_delete
AFTER DELETE ON app_users
FOR EACH ROW
WHEN OLD.participant_id IS NOT NULL
BEGIN
  UPDATE participants
  SET active = 0, updated_at = OLD.updated_at
  WHERE id = OLD.participant_id;
END;
