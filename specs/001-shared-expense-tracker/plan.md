# Implementation Plan: Shared Expense Tracker

**Branch**: `001-shared-expense-tracker` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-shared-expense-tracker/spec.md`

## Summary

Build a Spanish, mobile-first household expense tracker on Next.js App Router through OpenNext
for Cloudflare Workers. Auth.js Credentials with JWT sessions protects all household data. Direct,
typed D1 access stores users, expenses, exact integer shares, rate-limit state, and receipt metadata;
private receipt binaries stream through authenticated routes to R2. Wrangler/Miniflare supplies the
local D1 and R2 implementations, so Docker Compose is intentionally unnecessary.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode, React 19.2, Next.js 16.2, Node.js 20+ for tools

**Primary Dependencies**: Next.js App Router, `@opennextjs/cloudflare`, Auth.js v5 Credentials,
Zod, `ts-results`, Tailwind CSS 4, Lucide React

**Storage**: Cloudflare D1 through prepared statements and transactional `batch()`; Cloudflare R2
through a private Worker binding; Auth.js JWT cookie sessions

**Testing**: Vitest for unit and binding-backed integration tests, Miniflare for local D1/R2,
React Testing Library for interactive components, Playwright for authenticated browser journeys

**Target Platform**: Cloudflare Workers using OpenNext and `nodejs_compat`; evergreen mobile and
desktop browsers

**Project Type**: Full-stack web application in one Next.js App Router project

**Performance Goals**: Dashboard and filtered expense list render in under one second for 1,000
expenses under normal conditions; common mutations provide feedback within two seconds

**Constraints**: Integer-only money, exactly three participants, 10 MB receipt limit, private R2,
128 MB Worker memory, Spanish-default UI, no public registration, native local bindings

**Scale/Scope**: Three fixed expense participants, multiple application users, one household, up to
1,000 active expenses, seven protected pages, ten application API resources, one D1 database, one R2 bucket

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Traceability — PASS**: plan, data model, contracts, and tasks map to FR-001 through FR-018.
- **Financial integrity — PASS**: integer minor units, ordered remainder allocation, and D1 batches
  cover create and recalculation atomically.
- **Security/privacy — PASS**: Auth.js session checks exist at page and API boundaries; PBKDF2,
  generic failures, dual-scope D1 rate limits, input validation, audit data, and protected R2 routes
  are specified.
- **Runtime parity — PASS**: the same D1/R2 binding APIs run in Next development, Workers preview,
  tests, and deployment. No Docker service or filesystem-backed production substitute is present.
- **Spanish/mobile/accessibility/testing — PASS**: route design includes Spanish state copy,
  phone-first layouts, labeled controls, route boundaries, and unit/integration/browser gates.
- **Complexity — PASS**: one application and direct platform bindings are the simplest stack that
  meets the user-prescribed deployment target.

## Architecture Decisions

### Authentication and authorization

- A fresh deployment redirects sign-in to one-time `/setup` until a root account exists.
- Each account has one role in the hierarchy `root > admin > user`; role sets are deliberately
  avoided because higher roles already contain lower-role capabilities.
- D1 enforces one root with a partial unique index and prevents root deletion, disabling, or role
  mutation with triggers. Admin and root can create or soft-delete admins and regular users.
- JWT access refreshes current role and disabled state from D1 so removal revokes an existing
  session on its next access.
- `auth.ts` configures Auth.js v5 Credentials and JWT sessions; no Auth.js adapter tables are needed.
- `authorize` validates input, checks dual D1 login-attempt windows, verifies the encoded PBKDF2
  hash with Web Crypto, rejects disabled users, and returns only the application user identity.
- Edge `middleware.ts` redirects protected page requests to `/login`; every route handler independently calls
  `auth()` before reading request data or touching a binding.
- JWT/session callbacks carry `user.id`, `username`, `displayName`, and `participantId`.

### Data access and money

- `src/lib/db/` is server-only and owns all SQL. Route handlers do not inline queries.
- Prepared statements bind every input. Database helpers return `Result` values so HTTP handlers
  map predictable failures without scattered exception handling.
- Expense creation batches the expense plus three shares. Recalculation batches the expense update,
  share deletion, and replacement shares; a paid-state preflight enforces confirmation.
- `splitAmount()` is a pure utility that divides integer minor units and assigns remainder units in
  ascending participant order.

### Receipts

- Creating the financial record happens first. An optional raw-body `PUT` then streams the receipt
  to `receipts/{expenseId}/{uuid}.{ext}` through the `RECEIPTS` binding and records metadata in D1.
- Both declared and resulting object size are checked; an oversized result is immediately deleted.
- `GET` streams a known expense's object only after authentication and association lookup. No route
  lists bucket contents and no public bucket URL is configured.
- A failed receipt upload leaves a valid expense without a receipt and the UI offers retry. A failed
  D1 metadata update deletes the just-written object to avoid an orphan.

### Rendering and interaction

- Protected layouts and read-heavy pages are Server Components that fetch D1 directly.
- Forms, filters, confirmation dialogs, reimbursement toggles, and receipt uploads are leaf Client
  Components calling shared fetch clients under `src/lib/api/`.
- Async route segments include `loading.tsx` and `error.tsx`; root metadata and Spanish locale are
  declared through Next.js metadata and layout APIs.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-expense-tracker/
├── checklists/requirements.md
├── contracts/openapi.yaml
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
migrations/
├── 0001_initial.sql
├── 0002_seed_participants.sql
└── 0003_add_user_roles.sql

scripts/
└── seed-users.ts

src/
├── app/
│   ├── (auth)/login/
│   ├── (protected)/
│   │   ├── expenses/[id]/edit/
│   │   ├── expenses/[id]/
│   │   ├── expenses/new/
│   │   ├── expenses/
│   │   ├── settings/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── dashboard/
│   │   ├── expense-shares/[id]/status/
│   │   ├── expenses/[id]/receipt/
│   │   ├── expenses/[id]/
│   │   ├── expenses/
│   │   └── participants/
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── dashboard/
│   ├── expenses/
│   ├── layout/
│   └── ui/
├── lib/
│   ├── api/
│   ├── const/
│   ├── db/
│   ├── types/
│   └── util/
├── auth.ts
└── middleware.ts

tests/
├── e2e/
├── integration/
└── unit/
```

**Structure Decision**: Use one `src/`-based Next.js application. App Router colocates pages and
route handlers, while shared API, database, type, and pure utility layers follow the constitution
and Next.js skill conventions. Tests are separated by boundary rather than duplicating a backend.

## Delivery Sequence

1. Bind and migrate native D1/R2 resources; generate binding types and seed participants.
2. Bootstrap the one-time root account and manage subsequent accounts through role-gated UI/API.
3. Add PBKDF2 and Auth.js Credentials with rate limiting and complete route protection.
4. Implement exact splitting, database result wrappers, expense CRUD, and reimbursement updates.
5. Implement private receipt upload/view and compensating cleanup.
6. Build the Spanish dashboard, responsive expense flows, filters, and accessibility states.
7. Complete unit, binding integration, and browser flows; verify Next build and Workers preview.

## Complexity Tracking

No constitution violations or exceptional complexity are required.
