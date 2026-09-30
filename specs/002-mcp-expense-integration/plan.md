# Implementation Plan: OAuth-Authenticated Expense MCP

**Branch**: `002-mcp-expense-integration` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-mcp-expense-integration/spec.md`

## Summary

Add an in-app OAuth 2.1 authorization server backed by existing Auth.js users, accept scoped opaque bearer tokens across the non-admin finance API, and expose sixteen expense tools through a stateless Web Standards Streamable HTTP MCP endpoint. Financial and file workflows move into shared server-only services so REST and MCP preserve the same validation, atomic writes, notifications, R2 privacy, and reimbursement rules.

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode, React 19.2, Next.js 16.2, Node.js 20+ tools

**Primary Dependencies**: Existing Next.js/Auth.js/Zod stack plus stable v1 `@modelcontextprotocol/sdk` 1.29.0

**Storage**: Cloudflare D1 for hashed OAuth credentials, grants, rate limits, idempotency, and financial data; private R2 for receipt/proof bytes

**Testing**: Vitest unit and Miniflare binding integration tests, MCP SDK client integration tests, React Testing Library, Playwright

**Target Platform**: OpenNext Cloudflare Workers with Web Standards request/response transport

**Project Type**: Single full-stack Next.js App Router application

**Performance Goals**: Bearer validation adds under 50 ms at p95 under normal D1 conditions; token last-use writes are throttled to hourly; existing 1,000-expense page target remains under one second

**Constraints**: OAuth 2.1 authorization code + PKCE-S256, no personal keys, opaque hashed credentials, 128 MB Worker memory, 10 MB files, stateless JSON MCP, Spanish-first consent and settings

**Scale/Scope**: One household, regular participant-linked users, registered interactive OAuth clients, sixteen MCP tools, existing finance API surface

## Constitution Check

_GATE: Passed before research and after design._

- **Traceability — PASS**: FR-001 through FR-020 map to contracts and task IDs.
- **Financial integrity — PASS**: Services retain integer minor units, D1 batch writes, deterministic splitting, and audit transitions.
- **Security/privacy — PASS**: Exact audiences/redirects, PKCE, hashed opaque credentials, rotation/reuse detection, rate limits, session-only privileged routes, SSRF controls, and private R2 are specified.
- **Runtime parity — PASS**: D1/R2/Web Crypto/Web Standard transports work in Workers and Miniflare without new services.
- **Spanish/accessibility/testing — PASS**: Consent/settings are Spanish and keyboard/screen-reader accessible; unit, integration, SDK, and browser tests are required.
- **Complexity — PASS**: OAuth persistence and application services are necessary to provide immediate revocation and shared REST/MCP semantics; no separate backend is added.

## Architecture Decisions

### OAuth authorization server

- Normalize `APP_BASE_URL` once to an HTTPS origin and use it as issuer and canonical resource.
- Add a numbered D1 migration with clients, grants, codes, access tokens, refresh tokens, OAuth rate limits, and MCP idempotency records plus active/lookup indexes and integrity checks.
- Use Web Crypto for random bytes, SHA-256 credential hashes, and PKCE verification. Credentials are returned once and never logged.
- Registration supports public clients and `client_secret_post` confidential clients with exact redirect arrays.
- Authorization uses the existing Auth.js browser session; only enabled `user` accounts with participants may consent.
- Code consumption and token issuance use one conditional D1 batch. Refresh rotation is serialized by conditional update, and any rotated-token reuse revokes its family.
- Grant disconnection and disabled-user checks are evaluated during every bearer request, enabling immediate invalidation.

### Authenticated actor and scopes

- `src/lib/auth/actor.ts` resolves either Auth.js session or an OAuth bearer token.
- The existence of any Authorization header is authoritative: unsupported schemes, malformed tokens, and invalid tokens return 401 and never consult the cookie.
- Routes declare whether bearer is allowed and the required scope. Session actors retain current role behavior; OAuth actors must be regular users.
- Finance scope mapping follows the spec. Bootstrap, Auth.js, admin, household administration, and OAuth grant management stay session-only.
- Valid access tokens join user, grant, and client state and validate hash, expiry, revocation, role/participant, resource, and scopes. Usage timestamps update only if older than one hour.

### Shared application services

- Extract expense creation/list/detail orchestration to `src/lib/services/expenses.ts` including kind validation, transaction, notification, optional receipt, and idempotency adapters.
- Extract receipt and proof validation/storage/cleanup to `src/lib/services/files.ts` and reimbursement transitions/share resolution to `src/lib/services/reimbursements.ts`.
- Existing routes become thin request/response adapters. MCP tools call the same services directly with an authenticated actor.

### MCP endpoint

- Register sixteen tools on a new `McpServer` for each POST using v1 Web Standards Streamable HTTP with no session ID and JSON responses.
- Validate host/origin before bearer authentication. GET and DELETE return 405; no legacy SSE route exists.
- Attach required scope to each tool handler and serialize safe DTOs with structured content, Spanish summaries, visible business errors, and tool annotations.
- Close transport and server in `finally` to prevent request actor leakage.

### File acquisition

- Publish concrete ChatGPT file descriptors with `_meta["openai/fileParams"]` for receipt and proof tools, and separate parameters for generic base64 inputs.
- Decode inline files with preflight encoded-length bounds.
- Remote downloads require HTTPS and no credentials, trusted DNS zones, manual bounded redirects, public DNS results for every hop, safe ports, accepted content type and byte signatures, capped streaming bytes, and a total deadline.
- Existing R2 service functions use unique internal keys and compensating delete if metadata persistence fails.

### Connected applications UI

- Session-only grant APIs list safe grant/client fields and revoke owned grants transactionally.
- The regular-user settings page renders an accessible Spanish connected-applications section with confirmation and disconnect feedback. Admin settings remain unchanged and no credential UI is introduced.

## Project Structure

### Documentation

```text
specs/002-mcp-expense-integration/
├── checklists/requirements.md
├── contracts/oauth.md
├── contracts/mcp-tools.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source Code

```text
migrations/0010_add_oauth_mcp.sql
src/
├── app/
│   ├── .well-known/oauth-authorization-server/route.ts
│   ├── .well-known/oauth-protected-resource/route.ts
│   ├── .well-known/oauth-protected-resource/mcp/route.ts
│   ├── api/oauth/grants/[id]/route.ts
│   ├── api/oauth/grants/route.ts
│   ├── mcp/route.ts
│   └── oauth/{authorize,register,revoke,token}/
├── components/settings/connected-applications.tsx
└── lib/
    ├── auth/actor.ts
    ├── db/{oauth,mcp-idempotency}.ts
    ├── mcp/{files,results,server,tools}.ts
    ├── oauth/{constants,crypto,errors,metadata,validation}.ts
    ├── services/{expenses,files,reimbursements}.ts
    └── types/{actor,oauth}.ts
tests/
├── e2e/oauth.spec.ts
├── integration/{finance-oauth,mcp,oauth}.test.ts
└── unit/{mcp-files,mcp-results,oauth}.test.ts
```

**Structure Decision**: Extend the existing single Next.js project. Protocol routes stay colocated in App Router, D1 access remains server-only, shared workflows live in application services, and tests remain separated by boundary.

## Delivery Sequence

1. Complete specification/contracts and update the OpenAPI/agent references.
2. Add SDK dependency, D1 migration, OAuth types/crypto/validation/repositories, and unit/migration tests.
3. Implement discovery, registration, authorization/consent, token rotation, revocation, rate limiting, and connected-grant APIs/UI.
4. Introduce authenticated actors and apply exact scope mapping to all non-admin finance routes.
5. Extract shared expense/file/reimbursement services without changing session behavior.
6. Implement MCP protocol endpoint, results, sixteen tools, file acquisition, and idempotency.
7. Add integration/browser coverage and run every quality/build/preview/manual acceptance gate.

## Complexity Tracking

No constitution exception is required. The additional tables model security-critical OAuth lifecycle state that cannot be safely inferred from sessions, and application services eliminate rather than duplicate business logic.

## Reliability audit implementation

Implement FR-021–FR-028 in one PR with coherent commits. Use conditional D1 statements in a transactional batch for code exchange, an atomic upsert for rate limits, and ownership predicates for every revocation statement. Migrate registered client scopes with a compatibility default for existing registrations. Keep PKCE, resource binding, opaque hashed credentials and strict refresh-family reuse detection.

Use separate ChatGPT descriptor and bounded inline-file parameters so discoverable file schemas remain concrete. Share byte validation and storage cleanup with existing file services, bound remote-file and email requests, and resume failed receipt uploads through expense idempotency. Extend MCP with typed schemas and existing finance services, including caller-owned reimbursement operations. Add safe OAuth diagnostics, connection-expiry status, and scheduled maintenance that preserves financial idempotency and live refresh families.

Verify actual SDK discovery/calls, OAuth storage failure and concurrency, receipt retry/cleanup, private files and scope challenges in disposable D1/R2 fixtures. Run repository formatting, lint, type, unit, integration, browser and production build gates plus a local Workers preview smoke. Live ChatGPT acceptance requires the deployed version and an interactive account; do not claim it from local tests.
