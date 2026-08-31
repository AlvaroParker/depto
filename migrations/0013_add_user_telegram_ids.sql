ALTER TABLE app_users
ADD COLUMN telegram_user_id TEXT
  CHECK (
    telegram_user_id IS NULL
    OR (
      role = 'user'
      AND length(telegram_user_id) BETWEEN 1 AND 13
      AND telegram_user_id NOT GLOB '*[^0-9]*'
      AND telegram_user_id = CAST(CAST(telegram_user_id AS INTEGER) AS TEXT)
      AND CAST(telegram_user_id AS INTEGER) BETWEEN 1 AND 1099511627775
    )
  );

CREATE UNIQUE INDEX idx_app_users_telegram_user_id
  ON app_users(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
