# Research: OAuth-Authenticated Expense MCP

## MCP SDK and transport

- **Decision**: Pin the stable v1 `@modelcontextprotocol/sdk` package and use its Web Standards Streamable HTTP server transport in stateless JSON-response mode, constructing and closing the server and transport for every request.
- **Rationale**: The application runs in Cloudflare Workers, where Web `Request`/`Response` primitives are native and Node HTTP adapters are inappropriate. Per-request protocol objects prevent actor context leaking between concurrent requests.
- **Alternatives considered**: Node/Express transport (not Workers-native), SSE/stateful sessions (unneeded and incompatible with the tools-only scope), hand-written JSON-RPC (unnecessary protocol risk).

## OAuth server shape

- **Decision**: Implement an in-app OAuth 2.1 authorization server using opaque hashed credentials, PKCE-S256, RFC 8414 metadata, RFC 9728 protected-resource metadata, RFC 7591 dynamic registration, RFC 8707 resource indicators, and RFC 7009 revocation.
- **Rationale**: The existing Auth.js session is the authoritative interactive identity, while opaque server-stored tokens allow immediate user/grant revocation and reuse detection without signing-key management.
- **Alternatives considered**: JWT access tokens (harder immediate invalidation), personal API keys (explicitly excluded), external identity provider (adds operational dependency and duplicates existing accounts).

## Canonical resource and audiences

- **Decision**: Normalize `APP_BASE_URL` to an HTTPS origin and use that origin as the sole OAuth resource/audience for both `/api` and `/mcp`.
- **Rationale**: A single precise audience permits both interfaces while preventing token passthrough to unrelated origins. Authorization, token exchange, refresh, and bearer authentication all compare the exact normalized value.
- **Alternatives considered**: `/mcp` as the audience (would exclude REST), arbitrary caller resources (unsafe), multiple resource audiences (unneeded complexity).

## Credential storage and lifecycle

- **Decision**: Generate at least 256 bits of entropy for codes/tokens, return base64url values, and persist SHA-256 hashes only. Codes live five minutes and are atomically consumed. Access tokens live one hour. Refresh tokens rotate on every exchange, have a 90-day sliding expiration, and belong to a family revoked on predecessor reuse.
- **Rationale**: Database disclosure does not reveal usable credentials, and token families provide deterministic replay containment.
- **Alternatives considered**: Reusable refresh tokens (replay risk), PBKDF2 for random tokens (unnecessary cost for high-entropy values), indefinite refresh tokens (excessive exposure).

## Shared authenticated actor

- **Decision**: Centralize session-or-bearer resolution in a server-only module. The presence of any Authorization header selects bearer processing and blocks cookie fallback. The actor carries source, user identity, participant, role, grant, client, and scopes.
- **Rationale**: One boundary makes precedence, disabled-user enforcement, audience checks, scope failures, and last-use throttling consistent across every finance route and MCP tool.
- **Alternatives considered**: Route-specific checks (drift-prone), middleware-only authorization (insufficient for App Router handlers and binding access).

## Dynamic client registration

- **Decision**: Accept public clients (`token_endpoint_auth_method=none`) and confidential clients (`client_secret_post`) with exact HTTPS redirect URIs; permit loopback HTTP only for native development redirects. Store client-secret hashes and return a generated secret once.
- **Rationale**: This covers ChatGPT/Claude-style public clients and conventional confidential clients while retaining OAuth native-app interoperability.
- **Alternatives considered**: Public clients only (unnecessarily restrictive), wildcard redirects (code interception risk), client metadata URLs only (not universally supported by current connectors).

## File acquisition and SSRF

- **Decision**: Accept either bounded base64 or a ChatGPT descriptor. Fetch only HTTPS without URL credentials, resolve DNS before every hop, reject loopback/private/link-local/reserved addresses for IPv4 and IPv6, disable automatic redirects, validate each redirect explicitly, stream with a 10 MB cap, and validate declared and detected media types.
- **Rationale**: Temporary file URLs are attacker-controlled input and must not become a network pivot or memory exhaustion path.
- **Alternatives considered**: Blind `fetch()` with redirects (SSRF), hostname blocklist only (DNS rebinding gaps), buffering without caps (Workers memory risk).

## Service extraction

- **Decision**: Move financial workflows from HTTP handlers into server-only application services, leaving route handlers responsible for transport parsing and response mapping.
- **Rationale**: MCP and REST must share validation, transactions, authorization rules, notifications, and compensating R2 cleanup rather than cloning them.
- **Alternatives considered**: MCP calling internal HTTP routes (extra latency, credential forwarding, awkward file handling), duplicating route logic (behavior drift).

## Rate limits and observability

- **Decision**: Persist fixed-window counters for registration, authorization, and failed token exchanges using hashes of normalized address/client identifiers. Log operation type, status class, and safe record IDs only.
- **Rationale**: OAuth endpoints are public attack surfaces, while credentials and authorization headers must never enter logs.
- **Alternatives considered**: Process memory counters (not durable in Workers), raw address/client logging (privacy leakage).

## Sources

- MCP Authorization specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP TypeScript SDK server guide: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- Stable v1 SDK package: https://www.npmjs.com/package/@modelcontextprotocol/sdk
