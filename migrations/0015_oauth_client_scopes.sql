-- Existing clients retain the permissions previously supported by registration.
ALTER TABLE oauth_clients ADD COLUMN scopes TEXT NOT NULL DEFAULT 'expenses:read expenses:write offline_access reimbursements:write';
