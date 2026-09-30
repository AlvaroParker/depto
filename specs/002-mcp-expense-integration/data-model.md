# Data Model: OAuth-Authenticated Expense MCP

All timestamps are UTC ISO-8601 text. All identifiers are opaque text IDs. Secret-bearing values are represented only by fixed-length SHA-256 base64url hashes.

## `oauth_clients`

Registered external applications.

| Field                        | Rules                                                     |
| ---------------------------- | --------------------------------------------------------- |
| `id`                         | Primary key and OAuth `client_id`                         |
| `name`                       | Trimmed, 1–100 characters                                 |
| `redirect_uris_json`         | Non-empty JSON string array; exact-match entries only     |
| `grant_types_json`           | Subset of `authorization_code`, `refresh_token`           |
| `response_types_json`        | Exactly `code` for v1                                     |
| `scopes`                     | Normalized allowed scopes; consent cannot exceed this set |
| `token_endpoint_auth_method` | `none` or `client_secret_post`                            |
| `client_secret_hash`         | Required only for confidential clients                    |
| `created_at`, `updated_at`   | Audit timestamps                                          |
| `last_used_at`               | Throttled usage timestamp                                 |
| `revoked_at`                 | Soft revocation                                           |

One client has many grants, codes, and token families. Revocation blocks new authorization and token exchange. Migration `0015` adds registered scope policy while preserving the previous supported-scope set for existing clients.

## `oauth_grants`

Current consent from one participant-linked regular user to one client/resource.

| Field                                      | Rules                                    |
| ------------------------------------------ | ---------------------------------------- |
| `id`                                       | Primary key                              |
| `client_id`, `user_id`                     | Required foreign keys                    |
| `resource`                                 | Exact canonical application origin       |
| `scopes`                                   | Space-delimited normalized unique scopes |
| `created_at`, `updated_at`, `last_used_at` | Audit timestamps                         |
| `revoked_at`                               | Immediate disconnect marker              |

There is at most one active grant per `(client_id, user_id, resource)`. Re-consent replaces the scope set and revokes prior active credentials before issuing a new code.

## `oauth_authorization_codes`

| Field                                | Rules                                  |
| ------------------------------------ | -------------------------------------- |
| `id`, `code_hash`                    | Primary key and unique credential hash |
| `grant_id`, `client_id`, `user_id`   | Required binding                       |
| `redirect_uri`, `resource`, `scopes` | Exact exchange constraints             |
| `code_challenge`                     | Base64url SHA-256 challenge            |
| `code_challenge_method`              | `S256` only                            |
| `created_at`, `expires_at`           | Five-minute lifetime                   |
| `consumed_at`, `revoked_at`          | Single-use/revocation state            |

Consumption and token issuance share one conditional D1 batch that succeeds only while the code, grant, client and user remain eligible. A rolled-back issuance leaves the code redeemable; concurrent redemption issues credentials once.

## `oauth_access_tokens`

| Field                                      | Rules                                    |
| ------------------------------------------ | ---------------------------------------- |
| `id`, `token_hash`                         | Primary key and unique credential hash   |
| `grant_id`, `client_id`, `user_id`         | Required binding                         |
| `resource`, `scopes`                       | Audience and authority                   |
| `refresh_family_id`                        | Nullable; links tokens issued by refresh |
| `created_at`, `expires_at`, `last_used_at` | One-hour lifetime and throttled use      |
| `revoked_at`                               | Immediate invalidation                   |

Bearer authentication joins the user, client, and grant and rejects any disabled/revoked/mismatched record.

## `oauth_refresh_tokens`

| Field                                      | Rules                                       |
| ------------------------------------------ | ------------------------------------------- |
| `id`, `token_hash`                         | Primary key and unique credential hash      |
| `family_id`                                | Shared across rotations                     |
| `generation`                               | Starts at zero and increases exactly by one |
| `grant_id`, `client_id`, `user_id`         | Required binding                            |
| `resource`, `scopes`                       | Exact refresh constraints                   |
| `created_at`, `expires_at`, `last_used_at` | 90-day sliding lifetime                     |
| `rotated_at`, `replaced_by_token_id`       | Set exactly once during rotation            |
| `revoked_at`, `reuse_detected_at`          | Family invalidation state                   |

An exchange conditionally marks the current token rotated and inserts its replacement. Encountering an already rotated token sets `reuse_detected_at` and revokes every token/access token in the family.

## `oauth_rate_limits`

| Field                                              | Rules                 |
| -------------------------------------------------- | --------------------- |
| `operation`, `key_hash`                            | Composite primary key |
| `attempt_count`                                    | Non-negative count    |
| `window_started_at`, `blocked_until`, `updated_at` | Fixed-window state    |

Operations are `registration`, `authorization`, and `token_failure`. An atomic upsert increments each attempt and applies the blocking window under concurrency.

## `mcp_idempotency_records`

| Field                                     | Rules                                       |
| ----------------------------------------- | ------------------------------------------- |
| `id`                                      | Primary key                                 |
| `user_id`, `tool_name`, `idempotency_key` | Unique composite caller identity            |
| `request_hash`                            | Canonical JSON request hash                 |
| `expense_id`                              | Original committed expense                  |
| `created_at`, `expires_at`                | Audit and expiry for abandoned reservations |

An identical request returns the stored expense; a different request hash returns a conflict. Completed records are retained indefinitely. A retry can attach a missing receipt to the original expense without overwriting a receipt already attached.

## Expiry and maintenance

Connection status is derived from unrevoked access tokens, refresh tokens and unconsumed codes: `active`, `refreshable`, `awaiting_exchange` or `expired`. Refresh reuse is reported separately, without exposing credentials.

Daily maintenance removes codes/access tokens seven days after expiry, stale rate-limit rows and abandoned idempotency reservations after seven days, unused clients after thirty days, and refresh families thirty days after their last expiry. Predecessors in a live refresh family remain available for reuse detection. Consent history and completed financial idempotency remain. Migration `0016` indexes grant-expiry lookups and short-lived credential expiry.

## Existing entity invariants

- OAuth-authorized users must have `role = 'user'`, `disabled_at IS NULL`, and a non-null participant.
- Financial amounts remain integer minor units.
- Expense/share writes and open-share recalculation remain atomic.
- Receipt/proof object keys stay internal and are never serialized to OAuth clients or MCP tools.
