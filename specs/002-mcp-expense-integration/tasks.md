# Tasks: OAuth-Authenticated Expense MCP

**Input**: Design documents from `/specs/002-mcp-expense-integration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Mandatory for OAuth security, financial routes, MCP protocol/tools, files, database lifecycle, and browser consent/grant management.

## Phase 1: Setup and contracts

- [x] T001 Create feature artifacts and completed requirement checklist in specs/002-mcp-expense-integration/
- [x] T002 Update existing REST contract for OAuth bearer scopes in specs/001-shared-expense-tracker/contracts/openapi.yaml
- [x] T003 Update the Spec Kit plan reference in AGENTS.md
- [x] T004 Add stable v1 MCP SDK dependency in package.json and pnpm-lock.yaml
- [x] T005 Verify ignore configurations for the existing TypeScript/Next.js project in .gitignore, eslint.config.mjs, and .prettierignore

## Phase 2: Foundational OAuth and service infrastructure

- [x] T006 Add OAuth, token-family, rate-limit, and MCP idempotency schema in migrations/0010_add_oauth_mcp.sql
- [x] T007 [P] Add OAuth scope, credential, grant, actor, and DTO types in src/lib/types/oauth.ts and src/lib/types/actor.ts
- [x] T008 [P] Add canonical resource, scope, TTL, and safe-error constants in src/lib/oauth/constants.ts
- [x] T009 [P] Write OAuth crypto, PKCE, redirect/resource, and scope tests in tests/unit/oauth.test.ts
- [x] T010 Implement random credential hashing and PKCE utilities in src/lib/oauth/crypto.ts
- [x] T011 Implement redirect, resource, client metadata, and scope validation in src/lib/oauth/validation.ts
- [x] T012 Implement OAuth client/grant/code/token/rate-limit persistence and atomic lifecycle operations in src/lib/db/oauth.ts
- [x] T013 Implement MCP idempotency persistence in src/lib/db/mcp-idempotency.ts
- [x] T014 Add OAuth migration and lifecycle integration tests in tests/integration/oauth-storage.test.ts

## Phase 3: User Story 1 - Connect an application safely (P1)

**Independent Test**: Register, approve with PKCE, exchange, rotate, detect reuse, revoke, disable user, and verify all credentials are hashed and invalidated.

- [x] T015 [P] [US1] Write discovery, registration, authorization, exchange, rotation, revocation, and disabled-user tests in tests/integration/oauth.test.ts
- [x] T016 [US1] Implement OAuth protocol errors and no-store responses in src/lib/oauth/errors.ts
- [x] T017 [US1] Implement protected-resource and authorization-server metadata in src/lib/oauth/metadata.ts and src/app/.well-known/
- [x] T018 [US1] Implement rate-limited dynamic client registration in src/app/oauth/register/route.ts
- [x] T019 [US1] Implement accessible Spanish consent request validation and UI in src/app/oauth/authorize/page.tsx and src/components/oauth/consent-form.tsx
- [x] T020 [US1] Implement approval/denial and code issuance in src/app/oauth/authorize/decision/route.ts
- [x] T021 [US1] Implement authorization-code and rotating-refresh exchanges in src/app/oauth/token/route.ts
- [x] T022 [US1] Implement token revocation in src/app/oauth/revoke/route.ts

## Phase 4: User Story 2 - Finance API bearer integration (P1)

**Independent Test**: Exercise each non-admin finance method with session, sufficient bearer scope, insufficient scope, invalid bearer plus valid cookie, disabled user, and bearer access to privileged endpoints.

- [x] T023 [P] [US2] Write authenticated actor precedence, audience, scope, expiry, and last-use tests in tests/unit/oauth-actor.test.ts
- [x] T024 [P] [US2] Write finance endpoint session/bearer scope matrix tests in tests/integration/finance-oauth.test.ts
- [x] T025 [US2] Implement shared session-or-bearer authenticated actor resolution in src/lib/auth/actor.ts
- [x] T026 [US2] Add OAuth bearer challenges and insufficient-scope responses in src/lib/api/server.ts
- [x] T027 [US2] Apply `expenses:read` to dashboard, participants, expense GET/list, receipt GET, and proof GET routes in src/app/api/
- [x] T028 [US2] Apply `expenses:write` to expense POST/PATCH/DELETE and receipt PUT/DELETE routes in src/app/api/
- [x] T029 [US2] Apply `reimbursements:write` to share status/proof/amount routes in src/app/api/expense-shares/
- [x] T030 [US2] Verify bootstrap, Auth.js, OAuth grants, household administration, and admin routes remain session-only in tests/integration/security.test.ts

## Phase 5: User Story 3 - Manage connected applications (P2)

**Independent Test**: Connect two applications, list safe metadata in settings, disconnect one, and verify its grant/codes/tokens are immediately invalid.

- [x] T031 [P] [US3] Write session-only grant listing/revocation tests in tests/integration/oauth-grants.test.ts
- [x] T032 [P] [US3] Write browser consent, denial, listing, and disconnect tests in tests/e2e/oauth.spec.ts
- [x] T033 [US3] Implement safe current-user grant listing in src/app/api/oauth/grants/route.ts
- [x] T034 [US3] Implement owned-grant revocation in src/app/api/oauth/grants/[id]/route.ts
- [x] T035 [US3] Add accessible Spanish connected-application management in src/components/settings/connected-applications.tsx and src/app/(protected)/settings/page.tsx

## Phase 6: Shared finance application services

- [x] T036 Extract expense validation, creation, splitting, notification, listing, and detail orchestration into src/lib/services/expenses.ts
- [x] T037 Extract receipt/proof R2 validation, persistence, and compensating cleanup into src/lib/services/files.ts
- [x] T038 Extract share resolution, status/proof transitions, and open-share recalculation into src/lib/services/reimbursements.ts
- [x] T039 Refactor existing finance route handlers to use the shared services in src/app/api/
- [x] T040 Run existing expense, receipt, proof, reimbursement, dashboard, and notification regression tests in tests/

## Phase 7: User Story 4 - MCP expense tools (P2)

**Independent Test**: Initialize through an SDK client, discover exactly eight annotated tools, call each with correct/incorrect scopes, and verify financial state and safe typed results.

- [x] T041 [P] [US4] Write MCP result formatting and safe serialization tests in tests/unit/mcp-results.test.ts
- [x] T042 [P] [US4] Write SDK initialize/list/call and auth/405/origin tests in tests/integration/mcp.test.ts
- [x] T043 [US4] Implement typed Spanish MCP success/business-error formatting in src/lib/mcp/results.ts
- [x] T044 [US4] Implement reference, balance, expense list, and expense detail tool handlers in src/lib/mcp/tools.ts
- [x] T045 [US4] Implement idempotent expense creation and reimbursement tool handlers in src/lib/mcp/tools.ts
- [x] T046 [US4] Register all eight tools with schemas, output schemas, annotations, and file metadata in src/lib/mcp/server.ts
- [x] T047 [US4] Implement per-request stateless Web Standards JSON transport, bearer challenge, host/origin checks, cleanup, and 405 methods in src/app/mcp/route.ts

## Phase 8: User Story 5 - Safe MCP files (P3)

**Independent Test**: Accept supported inline and safe remote files while rejecting private/loopback/reserved targets, unsafe redirects, credentials, bad types, and >10 MB bodies without orphaned R2 objects.

- [x] T048 [P] [US5] Write base64 limits, MIME, DNS/IP, redirect, and streaming cap tests in tests/unit/mcp-files.test.ts
- [x] T049 [P] [US5] Write receipt warning and proof replacement/cleanup integration tests in tests/integration/mcp-files.test.ts
- [x] T050 [US5] Implement bounded base64 and SSRF-safe temporary URL acquisition in src/lib/mcp/files.ts
- [x] T051 [US5] Integrate optional receipt and payment proof inputs into MCP tool handlers in src/lib/mcp/tools.ts

## Phase 9: Polish and verification

- [x] T052 Add OAuth/MCP environment and connector guidance to .dev.vars.example and README.md
- [x] T053 Run format, lint, typecheck, unit, integration, and browser tests using package.json scripts
- [x] T054 Run Next.js and OpenNext Cloudflare production builds and preview smoke tests
- [ ] T055 Complete manual MCP Inspector, ChatGPT developer mode, and Claude custom connector acceptance from specs/002-mcp-expense-integration/quickstart.md
- [x] T056 Configure repository-local codex identity and commit the coherent implementation as a Conventional Commit

## Dependencies & execution order

- Setup precedes foundational work; foundational OAuth storage/validation blocks all stories.
- US1 and US2 are the P1 security foundation. US3 depends on grants from US1. Shared services and US2 precede US4. US5 extends US4.
- Tests listed before implementation are written first and must demonstrate the missing behavior.
- Parallel markers affect different files only; this implementation will still preserve phase checkpoints.

## Traceability

- US1: FR-001–FR-009, SC-001–SC-002
- US2: FR-010–FR-011, SC-002 and SC-006
- US3: FR-012, SC-001–SC-002
- US4: FR-013–FR-017 and FR-019, SC-003–SC-004
- US5: FR-018–FR-020, SC-005

## Reliability audit follow-up (FR-021–FR-028)

- [x] T057 Add OAuth atomic issuance, transient-error, ownership, scope-policy and concurrent rate-limit regressions; implement the fixes.
- [x] T058 Add file descriptor, byte validation, download deadline, receipt replay and cleanup regressions; implement safe file workflows.
- [x] T059 Publish concrete tool schemas, OAuth challenges and field errors; add missing expense, file, payment, debt and report tools using shared rules.
- [x] T060 Add connection expiry diagnostics, safe failure correlation and scheduled credential maintenance.
- [x] T061 Update contracts and operator troubleshooting; run all automated gates and local Workers preview, review the complete diff and open one PR.

Verification results are recorded in [quickstart.md](./quickstart.md#reliability-verification--2026-09-30). The follow-up is submitted as [PR #30](https://github.com/AlvaroParker/depto/pull/30); live connector acceptance (T055) remains a deployment check.
