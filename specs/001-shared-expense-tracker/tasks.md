# Tasks: Shared Expense Tracker

**Input**: Design documents from `/specs/001-shared-expense-tracker/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`,
and `quickstart.md`

**Tests**: Mandatory under the project constitution. Story tests are listed before implementation.

**Organization**: Tasks are grouped by user story so each journey has an explicit independent test.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May run in parallel because it targets different files and has no incomplete dependency.
- **[Story]**: Maps directly to the corresponding story in `spec.md`.
- Every task names its expected repository path.

## Phase 1: Setup

**Purpose**: Complete shared tooling and Cloudflare resource configuration on the committed scaffold.

- [ ] T001 Add runtime/test dependencies and quality scripts in `package.json` and `pnpm-lock.yaml`
- [ ] T002 Configure D1 `DB` and R2 `RECEIPTS` local bindings in `wrangler.jsonc` and regenerate `cloudflare-env.d.ts`
- [ ] T003 [P] Add local secret template and exclude generated declarations from lint in `.dev.vars.example` and `eslint.config.mjs`
- [ ] T004 [P] Add Vitest, Miniflare, React Testing Library, and Playwright configuration in `vitest.config.ts`, `vitest.integration.config.ts`, and `playwright.config.ts`
- [ ] T005 [P] Add shared test environment setup in `tests/setup.ts` and `tests/fixtures/`

---

## Phase 2: Foundational

**Purpose**: Establish the schema and shared server/client contracts required by every story.

**⚠️ CRITICAL**: No user story can complete before this phase.

- [ ] T006 Add participant, user, login-attempt, expense, and share tables plus indexes in `migrations/0001_initial.sql`
- [ ] T007 Seed ordered Alvaro, Camila, and Trinidad participants in `migrations/0002_seed_participants.sql`
- [ ] T008 [P] Define constants for currencies, participants, receipts, and login limits in `src/lib/const/`
- [ ] T009 [P] Define shared API, participant, user, expense, share, receipt, and dashboard schemas/types in `src/lib/types/`
- [ ] T010 Implement Cloudflare binding access and typed database result handling in `src/lib/db/bindings.ts` and `src/lib/db/safe-db-call.ts`
- [ ] T011 [P] Implement normalized API fetch/error handling in `src/lib/api/client.ts`
- [ ] T012 [P] Implement ID, Chilean currency/date, filename, and client-address utilities in `src/lib/util/`
- [ ] T013 Implement participant lookup and seed assertions in `src/lib/db/participants.ts`
- [ ] T014 Implement environment-only PBKDF2 user seeding in `scripts/seed-users.ts`
- [ ] T015 Add base semantic tokens, typography, focus styles, and motion preferences in `src/app/globals.css`
- [ ] T016 [P] Add reusable button, field, badge, dialog, empty-state, and skeleton primitives in `src/components/ui/`

**Checkpoint**: Migrations apply locally, three participants are ordered, bindings resolve, and shared
contracts compile.

---

## Phase 3: User Story 1 — Sign in and keep household data private (Priority: P1) 🎯

**Goal**: Seed credentials users, authenticate safely, rate-limit generic failures, and block every
unauthenticated household page and API.

**Independent Test**: Valid seeded credentials reach the dashboard; invalid/disabled/limited attempts
produce the same safe response; unauthenticated protected page and API requests expose no data.

### Tests for User Story 1

- [ ] T017 [P] [US1] Add PBKDF2 format, verification, constant-time, and invalid-input tests in `tests/unit/password.test.ts`
- [ ] T018 [P] [US1] Add login-attempt window, dual-scope limit, expiry, and disabled-user integration tests in `tests/integration/auth.test.ts`
- [ ] T019 [P] [US1] Add valid, invalid, rate-limited, and unauthenticated browser journeys in `tests/e2e/auth.spec.ts`

### Implementation for User Story 1

- [ ] T020 [P] [US1] Implement PBKDF2-SHA-256 hashing and verification in `src/lib/util/password.ts`
- [ ] T021 [US1] Implement application-user and D1 login-attempt data access in `src/lib/db/users.ts` and `src/lib/db/login-attempts.ts`
- [ ] T022 [US1] Configure Auth.js Credentials, JWT/session callbacks, generic errors, and rate limits in `src/auth.ts` and `src/types/next-auth.d.ts`
- [ ] T023 [US1] Expose Auth.js handlers and protect pages in `src/app/api/auth/[...nextauth]/route.ts` and `src/proxy.ts`
- [ ] T024 [P] [US1] Build the accessible Spanish sign-in form in `src/components/auth/login-form.tsx`
- [ ] T025 [US1] Build the public login route and authenticated redirect in `src/app/(auth)/login/page.tsx` and `src/app/(auth)/layout.tsx`
- [ ] T026 [US1] Add protected application shell, navigation, session identity, and sign-out in `src/app/(protected)/layout.tsx` and `src/components/layout/`

**Checkpoint**: US1 passes independently and every later story can rely on authenticated identity.

---

## Phase 4: User Story 2 — Record and inspect a shared expense (Priority: P1)

**Goal**: Create exact three-way expenses and show complete list/detail views.

**Independent Test**: Creating divisible and remainder expenses atomically produces exactly three
correctly ordered shares and visible list/detail information; invalid input writes nothing.

### Tests for User Story 2

- [ ] T027 [P] [US2] Add exact split property, boundary, and ordering tests in `tests/unit/split-amount.test.ts`
- [ ] T028 [P] [US2] Add expense create/list/detail atomicity and validation integration tests in `tests/integration/expenses.test.ts`
- [ ] T029 [P] [US2] Add authenticated create, validation, list, and detail browser journey in `tests/e2e/create-expense.spec.ts`

### Implementation for User Story 2

- [ ] T030 [P] [US2] Implement deterministic integer split calculation in `src/lib/util/split-amount.ts`
- [ ] T031 [US2] Implement create, list, count, and detail D1 operations in `src/lib/db/expenses.ts`
- [ ] T032 [US2] Implement authenticated expense collection contract in `src/app/api/expenses/route.ts`
- [ ] T033 [US2] Implement authenticated expense detail read contract in `src/app/api/expenses/[id]/route.ts`
- [ ] T034 [P] [US2] Implement participant collection contract in `src/app/api/participants/route.ts`
- [ ] T035 [P] [US2] Build reusable Spanish expense fields and amount parsing in `src/components/expenses/expense-form.tsx`
- [ ] T036 [US2] Build add-expense page and post-create navigation in `src/app/(protected)/expenses/new/page.tsx`
- [ ] T037 [P] [US2] Build responsive expense table/cards and status summaries in `src/components/expenses/expense-list.tsx`
- [ ] T038 [US2] Build expense list and detail routes in `src/app/(protected)/expenses/page.tsx` and `src/app/(protected)/expenses/[id]/page.tsx`

**Checkpoint**: US2 independently replaces spreadsheet entry and inspection with exact totals.

---

## Phase 5: User Story 3 — Understand balances and record reimbursements (Priority: P1)

**Goal**: Compute actionable balances and safely toggle non-payer reimbursements.

**Independent Test**: Toggling pending/paid updates audit fields, detail, aggregate matrix, participant
balances, and total pending while payer shares remain immutable.

### Tests for User Story 3

- [ ] T039 [P] [US3] Add paid/pending transition, payer immutability, and audit integration tests in `tests/integration/reimbursements.test.ts`
- [ ] T040 [P] [US3] Add dashboard paid/share/net/matrix calculation integration tests in `tests/integration/dashboard.test.ts`
- [ ] T041 [P] [US3] Add dashboard and reimbursement toggle browser journey in `tests/e2e/reimbursements.spec.ts`

### Implementation for User Story 3

- [ ] T042 [P] [US3] Implement reimbursement state transitions in `src/lib/db/expense-shares.ts`
- [ ] T043 [P] [US3] Implement dashboard aggregates and recent expenses in `src/lib/db/dashboard.ts`
- [ ] T044 [US3] Implement authenticated share status contract in `src/app/api/expense-shares/[id]/status/route.ts`
- [ ] T045 [US3] Implement authenticated dashboard contract in `src/app/api/dashboard/route.ts`
- [ ] T046 [P] [US3] Build reimbursement breakdown and toggle controls in `src/components/expenses/reimbursement-list.tsx`
- [ ] T047 [P] [US3] Build summary cards, participant balances, and pending matrix in `src/components/dashboard/`
- [ ] T048 [US3] Build the Spanish dashboard route in `src/app/(protected)/page.tsx`

**Checkpoint**: US3 gives the household a current, auditable answer to who owes whom.

---

## Phase 6: User Story 4 — Attach and privately view a receipt (Priority: P2)

**Goal**: Stream supported receipts into private storage and serve only associated objects to sessions.

**Independent Test**: Each supported type at valid size survives reload; invalid/oversized uploads
fail; unauthenticated and unknown-object reads return no content.

### Tests for User Story 4

- [ ] T049 [P] [US4] Add MIME, filename, size-boundary, and key generation tests in `tests/unit/receipts.test.ts`
- [ ] T050 [P] [US4] Add local R2 upload/read/privacy/cleanup integration tests in `tests/integration/receipts.test.ts`
- [ ] T051 [P] [US4] Add receipt upload, retry, preview, and unauthenticated browser journey in `tests/e2e/receipts.spec.ts`

### Implementation for User Story 4

- [ ] T052 [P] [US4] Implement receipt metadata validation and safe object keys in `src/lib/util/receipts.ts`
- [ ] T053 [US4] Implement receipt association metadata updates in `src/lib/db/receipts.ts`
- [ ] T054 [US4] Implement authenticated streaming upload/view and compensating cleanup in `src/app/api/expenses/[id]/receipt/route.ts`
- [ ] T055 [P] [US4] Implement receipt API client with progress/error state in `src/lib/api/receipts.ts`
- [ ] T056 [US4] Add receipt picker, retry feedback, and protected preview/link in `src/components/expenses/receipt-field.tsx` and `src/components/expenses/receipt-viewer.tsx`

**Checkpoint**: US4 meets receipt persistence and privacy acceptance criteria with native local R2.

---

## Phase 7: User Story 5 — Correct or remove an expense safely (Priority: P2)

**Goal**: Preserve descriptive edits, explicitly reset paid states on financial edits, and soft delete.

**Independent Test**: Descriptive edits preserve state; confirmed amount/payer edits recalculate and
reset; unconfirmed paid-state resets return conflict; delete removes the expense from all normal totals.

### Tests for User Story 5

- [ ] T057 [P] [US5] Add descriptive edit, confirmed recalculation, conflict, and soft-delete integration tests in `tests/integration/edit-expense.test.ts`
- [ ] T058 [P] [US5] Add edit confirmation, receipt replacement, and delete browser journeys in `tests/e2e/edit-expense.spec.ts`

### Implementation for User Story 5

- [ ] T059 [US5] Add transactional update/recalculation and soft-delete operations in `src/lib/db/expenses.ts`
- [ ] T060 [US5] Add PATCH and DELETE contracts with paid-state conflict handling in `src/app/api/expenses/[id]/route.ts`
- [ ] T061 [P] [US5] Build destructive confirmation and delete controls in `src/components/expenses/delete-expense-button.tsx`
- [ ] T062 [US5] Build edit route with explicit reimbursement reset confirmation in `src/app/(protected)/expenses/[id]/edit/page.tsx` and `src/components/expenses/expense-form.tsx`

**Checkpoint**: US5 repairs data without silent financial-history loss and deletion is reversible in D1.

---

## Phase 8: User Story 6 — Find expenses quickly on a phone (Priority: P3)

**Goal**: Provide combined search/filter/pagination and polished phone and keyboard usability.

**Independent Test**: Search, payer, and pending filters combine correctly in stable newest-first order;
all primary flows work at 360 px without horizontal scroll and pass keyboard/accessibility checks.

### Tests for User Story 6

- [ ] T063 [P] [US6] Add combined query, stable sort, pagination, and soft-delete exclusion integration tests in `tests/integration/expense-filters.test.ts`
- [ ] T064 [P] [US6] Add mobile viewport and keyboard accessibility browser checks in `tests/e2e/mobile-accessibility.spec.ts`

### Implementation for User Story 6

- [ ] T065 [US6] Add bound search/payer/pending filters and stable pagination in `src/lib/db/expenses.ts`
- [ ] T066 [US6] Add validated query parameters and page metadata to `src/app/api/expenses/route.ts`
- [ ] T067 [P] [US6] Build URL-backed search and filter controls in `src/components/expenses/expense-filters.tsx`
- [ ] T068 [US6] Integrate filtering, pagination, and mobile cards in `src/app/(protected)/expenses/page.tsx` and `src/components/expenses/expense-list.tsx`
- [ ] T069 [P] [US6] Refine responsive shell, touch targets, focus order, and reduced motion in `src/components/layout/` and `src/app/globals.css`

**Checkpoint**: All six user stories are functional and independently verified.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Close runtime, error-state, performance, security, and documentation gates.

- [ ] T070 [P] Add Spanish loading, error, empty, and not-found boundaries in `src/app/(protected)/loading.tsx`, `src/app/(protected)/error.tsx`, and `src/app/(protected)/not-found.tsx`
- [ ] T071 [P] Add protected endpoint coverage matrix and secret/plaintext scan in `tests/integration/security.test.ts`
- [ ] T072 Add 1,000-expense dashboard/list performance fixture and assertions in `tests/integration/performance.test.ts`
- [ ] T073 [P] Replace scaffold documentation with complete pnpm local/remote guidance in `README.md`
- [ ] T074 Validate `specs/001-shared-expense-tracker/contracts/openapi.yaml` and reconcile any implementation drift
- [ ] T075 Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` and record fixes in relevant files
- [ ] T076 Run `pnpm test:e2e` against local bindings and fix all core journey failures
- [ ] T077 Run `pnpm build` and an authenticated `pnpm preview` Workers smoke test
- [ ] T078 Review all requirements/checklists, mark completed tasks, and ensure `git status` is clean with Conventional Commits

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Setup → Foundational → US1 authentication
                         ├─→ US2 expenses → US3 reimbursements/dashboard
                         │                  ├─→ US4 receipts
                         │                  ├─→ US5 edit/delete
                         │                  └─→ US6 filters/mobile
                         └──────────────────────────────→ Polish
```

- Setup has no prerequisites beyond the committed scaffold and approved plan.
- Foundational depends on Setup and blocks every user story.
- US1 blocks all data-bearing stories because authentication is mandatory.
- US2 supplies expense/share records required by US3, US4, US5, and US6.
- US3, US4, and US5 can proceed independently after US2; US6 integrates the completed list.
- Polish depends on all stories selected for delivery; full MVP definition requires all six.

### User Story Independence

- **US1**: Verified with seeded users and access probes; no expense data required.
- **US2**: Verified with authenticated create/list/detail fixtures; dashboard and receipts not required.
- **US3**: Verified using US2 fixtures; receipts, edit/delete, and filters not required.
- **US4**: Verified using one existing expense and local R2; dashboard and edits not required.
- **US5**: Verified using existing paid and pending fixtures; filters not required.
- **US6**: Verified using seeded expenses; receipt upload is not required for filter/mobile assertions.

## Parallel Opportunities

### US1

```text
T017 password tests || T018 D1 auth integration || T019 browser auth journey
T020 password utility || T024 login form
```

### US2

```text
T027 split tests || T028 DB integration || T029 browser journey
T030 split utility || T034 participants route || T035 form || T037 list UI
```

### US3

```text
T039 transition tests || T040 dashboard tests || T041 browser journey
T042 share DB || T043 dashboard DB || T046 controls || T047 dashboard components
```

### US4

```text
T049 validation tests || T050 R2 integration || T051 browser journey
T052 receipt utility || T055 receipt API client
```

### US5

```text
T057 integration tests || T058 browser journey || T061 confirmation controls
```

### US6

```text
T063 filter integration || T064 mobile browser checks
T067 filter controls || T069 responsive shell refinement
```

## Implementation Strategy

### MVP-first increments

1. Complete Setup and Foundational.
2. Complete US1 and validate the security boundary.
3. Complete US2 and validate exact expense recording—the first useful spreadsheet replacement.
4. Complete US3 for the core financial MVP: current balances and reimbursements.
5. Complete US4 and US5 for the supplied receipt and correction definition of done.
6. Complete US6 and Polish for mobile usability, filtering, and all delivery gates.

### Commit packaging

Commit coherent units after their relevant checks, using the specification's Conventional Commit
examples: configuration, migrations/seeds, authentication, expense/split logic, reimbursements,
receipts, edit/delete, dashboard/UI, tests, and documentation.

## Validation

- 78 tasks use the required checkbox and sequential `T###` identifier format.
- Every user-story task includes its `[US#]` label and exact file path.
- Setup, Foundational, and Polish tasks intentionally have no story label.
- Test tasks precede implementation tasks within every story.
