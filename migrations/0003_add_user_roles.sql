ALTER TABLE app_users
ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('root', 'admin', 'user'));

CREATE UNIQUE INDEX idx_app_users_single_root
  ON app_users(role)
  WHERE role = 'root';

CREATE TRIGGER app_users_prevent_root_delete
BEFORE DELETE ON app_users
FOR EACH ROW
WHEN OLD.role = 'root'
BEGIN
  SELECT RAISE(ABORT, 'the root user cannot be deleted');
END;

CREATE TRIGGER app_users_prevent_root_mutation
BEFORE UPDATE OF role, disabled_at ON app_users
FOR EACH ROW
WHEN OLD.role = 'root'
  AND (NEW.role <> 'root' OR NEW.disabled_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'the root user role and active status are immutable');
END;
