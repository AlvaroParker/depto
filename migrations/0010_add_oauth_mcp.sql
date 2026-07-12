CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  redirect_uris_json TEXT NOT NULL CHECK (json_valid(redirect_uris_json)),
  grant_types_json TEXT NOT NULL CHECK (json_valid(grant_types_json)),
  response_types_json TEXT NOT NULL CHECK (json_valid(response_types_json)),
  token_endpoint_auth_method TEXT NOT NULL
    CHECK (token_endpoint_auth_method IN ('none', 'client_secret_post')),
  client_secret_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  CHECK (
    (token_endpoint_auth_method = 'none' AND client_secret_hash IS NULL)
    OR (token_endpoint_auth_method = 'client_secret_post' AND client_secret_hash IS NOT NULL)
  )
);

CREATE INDEX idx_oauth_clients_active ON oauth_clients(revoked_at, created_at);

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT NOT NULL CHECK (length(scopes) BETWEEN 1 AND 255),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_oauth_grants_active_client_user_resource
  ON oauth_grants(client_id, user_id, resource)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_oauth_grants_user_active ON oauth_grants(user_id, revoked_at, created_at DESC);

CREATE TABLE oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT NOT NULL,
  code_challenge TEXT NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_oauth_codes_active ON oauth_authorization_codes(code_hash, expires_at, consumed_at, revoked_at);

CREATE TABLE oauth_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT NOT NULL,
  refresh_family_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_oauth_access_tokens_active ON oauth_access_tokens(token_hash, expires_at, revoked_at);
CREATE INDEX idx_oauth_access_tokens_family ON oauth_access_tokens(refresh_family_id, revoked_at);

CREATE TABLE oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  rotated_at TEXT,
  replaced_by_token_id TEXT,
  revoked_at TEXT,
  reuse_detected_at TEXT,
  FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (replaced_by_token_id) REFERENCES oauth_refresh_tokens(id) ON DELETE RESTRICT,
  UNIQUE (family_id, generation),
  CHECK (
    (rotated_at IS NULL AND replaced_by_token_id IS NULL)
    OR (rotated_at IS NOT NULL AND replaced_by_token_id IS NOT NULL)
  )
);

CREATE INDEX idx_oauth_refresh_tokens_active ON oauth_refresh_tokens(token_hash, expires_at, revoked_at);
CREATE INDEX idx_oauth_refresh_tokens_family ON oauth_refresh_tokens(family_id, generation);

CREATE TABLE oauth_rate_limits (
  operation TEXT NOT NULL CHECK (operation IN ('registration', 'authorization', 'token_failure')),
  key_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (operation, key_hash)
);

CREATE INDEX idx_oauth_rate_limits_cleanup ON oauth_rate_limits(updated_at);

CREATE TABLE mcp_idempotency_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK (length(tool_name) BETWEEN 1 AND 80),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL,
  expense_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT,
  UNIQUE (user_id, tool_name, idempotency_key)
);

CREATE INDEX idx_mcp_idempotency_expiry ON mcp_idempotency_records(expires_at);
