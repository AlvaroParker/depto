# OAuth and Discovery Contract

Canonical issuer and resource are the normalized `APP_BASE_URL` origin.

## Discovery

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp`

Returns `resource`, `authorization_servers`, `scopes_supported`, and bearer-token transport methods.

- `GET /.well-known/oauth-authorization-server`

Returns issuer, authorization/token/registration/revocation endpoints, supported scopes, `code` response type, authorization-code and refresh grant types, `S256`, and supported token endpoint authentication methods.

## Dynamic registration

`POST /oauth/register` accepts RFC 7591 client metadata:

```json
{
	"client_name": "Expense Assistant",
	"redirect_uris": ["https://client.example/callback"],
	"grant_types": ["authorization_code", "refresh_token"],
	"response_types": ["code"],
	"token_endpoint_auth_method": "none"
}
```

Returns `201` with a generated `client_id`, normalized metadata, and a one-time `client_secret` only for `client_secret_post`. Validation errors use OAuth registration error fields. The endpoint is rate-limited.

## Authorization

`GET /oauth/authorize` requires `response_type=code`, `client_id`, exact `redirect_uri`, non-empty `state`, supported `scope`, exact `resource`, `code_challenge`, and `code_challenge_method=S256`.

An unauthenticated browser is redirected through Auth.js sign-in and returns to the original request. A participant-linked regular user sees Spanish consent. Approval posts server-controlled request fields and a CSRF token, creates/replaces the grant, issues a five-minute code, and redirects with `code` and the original `state`. Denial redirects with `error=access_denied` and `state`. Invalid redirect/client requests are rendered locally and never redirected.

## Token endpoint

`POST /oauth/token` consumes `application/x-www-form-urlencoded`.

Authorization-code grant requires `grant_type=authorization_code`, `code`, `client_id`, exact `redirect_uri`, `code_verifier`, and exact `resource`. It atomically consumes the code after client authentication and PKCE verification.

Refresh grant requires `grant_type=refresh_token`, `refresh_token`, `client_id`, and exact `resource`. It rotates the refresh token and revokes the family on predecessor reuse.

Successful response:

```json
{
	"access_token": "opaque",
	"token_type": "Bearer",
	"expires_in": 3600,
	"scope": "expenses:read offline_access",
	"refresh_token": "opaque"
}
```

Code consumption and credential issuance are one conditional D1 transaction. Codes remain redeemable after a rolled-back issuance failure. Concurrent redemption succeeds once. Requested refresh scopes may narrow the original grant, never expand it. Registration stores allowed scopes and enforces allowed grant types. Existing registrations retain the previous supported-scope set after migration.

OAuth errors use `invalid_request`, `invalid_client`, `invalid_grant`, `invalid_scope`, `unauthorized_client`, or `unsupported_grant_type`, include `Cache-Control: no-store`, and never echo credentials. Temporary storage failures return `503 temporarily_unavailable` with `Retry-After`; they do not count as invalid credentials. Errors include `request_id` and `X-Request-Id` for safe structured-log correlation. Rate limits increment atomically under concurrency; blocked attempts return `429` with `Retry-After`.

## Revocation

`POST /oauth/revoke` accepts `token`, optional `token_type_hint`, and client authentication. It returns `200` for successful revocation or an unknown token, rejects invalid clients, and returns `503` on storage failure; known refresh tokens revoke their family, while access tokens are individually revoked.

## Connected applications

- `GET /api/oauth/grants`: Auth.js session only; regular user only. Lists unrevoked grants with client name, scopes, `createdAt`, `lastUsedAt`, `accessExpiresAt`, `refreshExpiresAt`, `refreshReuseDetected`, and `status` (`active`, `refreshable`, `awaiting_exchange`, `expired`).
- `DELETE /api/oauth/grants/{id}`: Auth.js session only; owner only. Revokes grant, codes, and all access/refresh tokens and returns `204`.

## Bearer challenge

Protected endpoints return `401` with:

```text
WWW-Authenticate: Bearer resource_metadata="{origin}/.well-known/oauth-protected-resource"
```

Scope failures return `403` and may add `error="insufficient_scope"` and `scope="..."`.

## Retention

Daily Workers maintenance removes codes and access tokens seven days after expiry, stale rate-limit rows and abandoned idempotency reservations after seven days, and unconsented clients after thirty days. Refresh predecessors are retained while any family member is live; entire families are removed thirty days after their last expiry. Completed expense idempotency records and consent history remain. Maintenance never calls external services and logs only aggregate counts or a fixed failure event.
