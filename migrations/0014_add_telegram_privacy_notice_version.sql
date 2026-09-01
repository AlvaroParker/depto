ALTER TABLE app_users
ADD COLUMN telegram_privacy_notice_version INTEGER NOT NULL DEFAULT 0
  CHECK (telegram_privacy_notice_version >= 0);
