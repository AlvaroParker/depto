# Feature Specification: OAuth-Authenticated Expense MCP

**Feature Branch**: `002-mcp-expense-integration`

**Created**: 2026-07-12

**Status**: Approved

**Input**: Add a public MCP interface and OAuth 2.1 authorization to the shared expense tracker without personal API keys.

## User Scenarios & Testing

### User Story 1 - Connect an application safely (Priority: P1)

As a regular household user, I can sign in, review an accessible Spanish consent screen, and authorize a named application with only the permissions it needs, without creating or copying a personal token.

**Why this priority**: Every external API and MCP operation depends on a secure, revocable user grant.

**Independent Test**: Register a client, approve an authorization request with PKCE, exchange the code, refresh once, and verify that disconnecting the application immediately prevents further use.

**Acceptance Scenarios**:

1. **Given** a regular signed-in user and a registered client, **When** the user approves requested scopes, **Then** the client receives a short-lived access token and receives a rotating refresh token only when `offline_access` was approved.
2. **Given** a disabled user or revoked grant, **When** a token is presented, **Then** access is rejected immediately.
3. **Given** a reused authorization code or refresh token, **When** it is exchanged again, **Then** the request fails and refresh-token reuse revokes the entire token family.
4. **Given** an administrator account, **When** it attempts to approve a client, **Then** authorization is refused because only participant-linked regular users may connect applications.

---

### User Story 2 - Use the finance API from a connected application (Priority: P1)

As an authorized application, I can use existing non-administrative finance endpoints on behalf of the connected participant, limited by the scopes the user granted.

**Why this priority**: A single authentication model must protect both REST and MCP access consistently.

**Independent Test**: Call every finance endpoint using a bearer token with sufficient and insufficient scopes, and verify that an invalid Authorization header never falls back to a valid browser session.

**Acceptance Scenarios**:

1. **Given** a valid read-scoped token, **When** dashboard, participant, expense, receipt, or proof data is requested, **Then** the request succeeds with the same household visibility as the user’s browser session.
2. **Given** a token without the required mutation scope, **When** a mutation is attempted, **Then** the request is forbidden without changing data.
3. **Given** any bearer token, **When** a bootstrap, sign-in, administrator, or grant-management endpoint is requested, **Then** bearer authentication is not accepted.

---

### User Story 3 - Manage connected applications (Priority: P2)

As a regular user, I can see which applications are connected, when each was connected and last used, which permissions it has, and disconnect any application.

**Why this priority**: Users need understandable control and immediate revocation after granting access.

**Independent Test**: Connect two applications, open settings, verify their details, disconnect one, and confirm all of its tokens stop working.

**Acceptance Scenarios**:

1. **Given** one or more active grants, **When** the user opens settings, **Then** “Aplicaciones conectadas” lists client name, scopes, connection time, and last use in Spanish.
2. **Given** an active grant, **When** the user disconnects it, **Then** its codes and tokens are revoked immediately and the grant disappears from the active list.
3. **Given** an OAuth bearer token, **When** it calls the connected-applications API, **Then** it is rejected because this API is session-only.

---

### User Story 4 - Use expenses through MCP (Priority: P2)

As a connected AI client, I can inspect reference data and balances, search and inspect expenses, create an expense safely, and manage only my own reimbursement state through typed tools.

**Why this priority**: This is the primary conversational integration while preserving the existing financial rules.

**Independent Test**: Connect an MCP SDK client, initialize it, discover all eight tools, and execute each tool against a participant-linked user while checking typed results and persisted financial state.

**Acceptance Scenarios**:

1. **Given** a read-scoped token, **When** reference, balance, list, or detail tools are called, **Then** typed structured data and concise Spanish text are returned.
2. **Given** a write-scoped token and an idempotency key, **When** expense creation is retried with identical input, **Then** the original expense is returned; different input with the same key returns a conflict.
3. **Given** the reimbursement scope, **When** a user changes status, attaches proof, or changes their pending open share, **Then** the server resolves their share and applies existing authorization and atomicity rules.
4. **Given** an unsupported MCP GET or DELETE streaming operation, **When** it is requested, **Then** the endpoint returns a protocol-compliant 405 response.

---

### User Story 5 - Attach safe files from an MCP client (Priority: P3)

As a connected AI client, I can attach receipts and payment proofs through bounded inline data or a temporary HTTPS download, without exposing credentials or allowing access to private network services.

**Why this priority**: File support completes the current expense workflow but is not required for read-only MCP use.

**Independent Test**: Upload every accepted type through both input modes and reject oversized, redirected-to-private, credential-bearing, loopback, and unsupported files without persisting orphaned objects.

**Acceptance Scenarios**:

1. **Given** a supported file under 10 MB, **When** it is supplied as bounded base64 or a safe HTTPS URL, **Then** it is validated and stored privately.
2. **Given** an unsafe target, redirect, type, or size, **When** a tool fetches the file, **Then** the tool returns a visible validation error and does not store the object.
3. **Given** an expense creation whose optional receipt upload fails, **When** the financial write already committed, **Then** the expense remains and the result contains a warning.

### Edge Cases

- Authorization requests missing `state`, PKCE-S256, an exact registered redirect URI, or the canonical resource are rejected.
- Client registration, authorization attempts, and failed token exchanges are rate-limited without logging credentials.
- Concurrent refresh attempts allow one rotation and treat later use of the predecessor as family reuse.
- Access tokens expire after one hour; authorization codes after five minutes; refresh families after 90 days without use.
- Supplying any malformed `Authorization` header takes precedence over a valid Auth.js cookie and returns an authentication error.
- `Origin` may be absent for server-to-server MCP calls; if present it and `Host` must match the configured application origin.
- Token and grant last-use writes occur no more than once per hour per active credential.
- Returning a paid share to pending removes proof metadata and attempts private-object cleanup consistently with the web flow.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST eliminate user-created personal API keys and all interfaces for creating, copying, or displaying long-lived credentials.
- **FR-002**: The system MUST expose authorization-server and protected-resource discovery at the root and MCP-specific well-known locations.
- **FR-003**: The system MUST support dynamic client registration with exact redirect URI validation and rate limiting.
- **FR-004**: The system MUST support authorization code grants with mandatory `state`, PKCE-S256, exact redirect matching, explicit resource indicators, five-minute single-use codes, and accessible Spanish approval and denial.
- **FR-005**: Only enabled `user` accounts linked to a participant MUST be able to authorize a client.
- **FR-006**: The system MUST issue opaque one-hour access tokens and optional rotating refresh tokens with a 90-day sliding lifetime, storing only hashes of all credentials and secrets.
- **FR-007**: Reuse of a rotated refresh token MUST revoke its entire family; disabling a user or disconnecting a grant MUST invalidate every related credential immediately.
- **FR-008**: The system MUST expose token exchange, refresh, and revocation endpoints and MUST validate the canonical application-origin resource throughout authorization and authentication.
- **FR-009**: The scopes MUST be `expenses:read`, `expenses:write`, `reimbursements:write`, and `offline_access`, with consent limited to registered and supported scopes.
- **FR-010**: A shared authenticated actor MUST accept existing sessions and OAuth bearer tokens on non-admin finance routes, with Authorization-header precedence and per-operation scope checks.
- **FR-011**: Bootstrap, sign-in, connected-application management, and administrator routes MUST remain session-only.
- **FR-012**: Regular users MUST be able to list and disconnect their grants from a Spanish settings interface without seeing credentials.
- **FR-013**: The system MUST expose a stateless JSON-response Streamable HTTP MCP endpoint over POST and return 405 for unused GET and DELETE streaming operations.
- **FR-014**: MCP requests MUST validate the configured host, validate any supplied origin, return OAuth-compatible challenges, and isolate request authentication and protocol state.
- **FR-015**: MCP MUST expose exactly the eight tools defined in the MCP contract, with typed structured output, concise Spanish summaries, visible business errors, and accurate behavior annotations.
- **FR-016**: Expense creation MUST reuse existing validation, atomic splitting, notification delivery, and a user/tool/key idempotency record; receipt failure MUST not roll back the committed financial record.
- **FR-017**: Reimbursement MCP tools MUST resolve the caller’s share server-side and reuse existing proof, status, and open-share rules.
- **FR-018**: MCP file inputs MUST support ChatGPT file descriptors and bounded base64, enforce the existing 10 MB/type limits, and prevent server-side request forgery, unsafe redirects, and credential disclosure.
- **FR-019**: Credential material, object keys, temporary download URLs, authorization headers, and secrets MUST never appear in logs or tool output.
- **FR-020**: Registration, authorization, failed exchange, credential lifecycle, scope enforcement, finance routes, MCP protocol/tools, file handling, and browser grant management MUST have automated coverage.

### Key Entities

- **OAuth Client**: A registered public or confidential application with a name, exact redirect URIs, allowed grant/response types, optional secret hash, and lifecycle timestamps.
- **OAuth Grant**: A user’s current consent to a client and canonical resource, including scopes, connection/use timestamps, and revocation state.
- **Authorization Code**: A short-lived, single-use hashed credential bound to client, user grant, redirect URI, resource, scopes, and PKCE challenge.
- **Access Token**: A short-lived hashed bearer credential bound to grant, user, resource audience, and scopes.
- **Refresh Token**: A hashed rotating credential in a revocable family with sliding expiration and predecessor/replacement state.
- **Authorization Rate Limit**: A bounded attempt counter keyed by operation and privacy-preserving client/address hash.
- **MCP Idempotency Record**: A mapping from user, tool, and caller key to request hash and original expense result.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A first-time user can connect a compatible application and complete consent in under two minutes without copying a credential.
- **SC-002**: Disconnecting an application or disabling its user prevents every subsequent API and MCP request from that grant, including requests using previously issued unexpired tokens.
- **SC-003**: All eight MCP tools can be discovered and exercised by a compatible client, with 100% of mutations enforcing the connected user’s identity and granted permissions.
- **SC-004**: Repeating an expense-creation request with the same idempotency key never creates a duplicate financial record.
- **SC-005**: Every tested unsafe or oversized remote file is rejected without accessing a private-network destination or leaving stored file data behind.
- **SC-006**: Existing session-based financial journeys continue to pass unchanged while all finance endpoints also pass bearer-token scope tests.

## Assumptions

- There are no user-generated API keys or machine-to-machine credentials.
- External clients act on behalf of an interactive regular user.
- Existing household visibility and role permissions are unchanged.
- MCP v1 is tools-only: no UI resource, prompt, sampling, notification, resumability, legacy SSE, or registry submission.
- Protocol identifiers remain English while user-facing consent, errors, and settings copy are Spanish-first.
