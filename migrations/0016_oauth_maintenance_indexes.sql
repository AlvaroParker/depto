CREATE INDEX idx_oauth_access_grant_expiry ON oauth_access_tokens(grant_id, expires_at);

CREATE INDEX idx_oauth_refresh_grant_expiry ON oauth_refresh_tokens(grant_id, expires_at);

CREATE INDEX idx_oauth_code_grant_expiry ON oauth_authorization_codes(grant_id, expires_at);

CREATE INDEX idx_oauth_access_expiry ON oauth_access_tokens(expires_at);

CREATE INDEX idx_oauth_code_expiry ON oauth_authorization_codes(expires_at);
