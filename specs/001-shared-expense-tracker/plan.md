# Implementation Plan: Shared Expense Tracker

**Branch**: `001-shared-expense-tracker` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-shared-expense-tracker/spec.md`

## Summary

Build a Spanish, mobile-first household expense tracker on Next.js App Router through OpenNext
for Cloudflare Workers. Auth.js Credentials with JWT sessions protects all household data. Direct,
typed D1 access stores users, expenses, exact integer shares, rate-limit state, and receipt metadata;
private receipt binaries stream through authenticated routes to R2. Wrangler/Miniflare supplies the
local D1 and R2 implementations, so Docker Compose is intentionally unnecessary.

Expenses reference admin-managed household categories. D1 seeds the core taxonomy, while a typed
semantic icon registry maps stored keys to explicit Lucide components in forms, history, and detail.

Participant payment proofs reuse the private R2 binding with a separate key prefix and one-to-one
D1 metadata per paid share. Share owners and root/admin users manage proof and status, while all
authenticated household users may inspect current evidence.

New expense creation resolves the selected participant emails from D1 and sends isolated messages
through Resend's batch REST API. Delivery uses an expense-scoped idempotency key and is best-effort
after the atomic financial write, so provider availability cannot corrupt or roll back an expense.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode, React 19.2, Next.js 16.2, Node.js 20+ for tools

**Primary Dependencies**: Next.js App Router, `@opennextjs/cloudflare`, Auth.js v5 Credentials,
Zod, `ts-results`, Tailwind CSS 4, Lucide React, Resend REST API

**Storage**: Cloudflare D1 through prepared statements and transactional `batch()`; Cloudflare R2
through a private Worker binding; Auth.js JWT cookie sessions

**Testing**: Vitest for unit and binding-backed integration tests, Miniflare for local D1/R2,
React Testing Library for interactive components, Playwright for authenticated browser journeys

**Target Platform**: Cloudflare Workers using OpenNext and `nodejs_compat`; evergreen mobile and
desktop browsers

**Project Type**: Full-stack web application in one Next.js App Router project

**Performance Goals**: Dashboard and filtered expense list render in under one second for 1,000
expenses under normal conditions; common mutations provide feedback within two seconds

**Constraints**: Integer-only money, selectable bill participants, 10 MB receipt limit, private R2,
128 MB Worker memory, Spanish-default UI, no public registration, native local bindings

**Scale/Scope**: One participant and notification email per regular application user, one household, up to
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
- Expense creation batches the expense plus one share per selected participant. Recalculation batches the expense update,
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

### Payment proofs

- `expense_share_payment_proofs` stores one current image association per paid share; object keys
  remain server-only and use a distinct `payment-proofs/{shareId}/` R2 prefix.
- A raw-body proof `PUT` marks a pending share paid and attaches metadata in one D1 batch, or replaces
  proof on an already-paid share without changing its original payment audit fields.
- Only the share owner and root/admin may mutate status or proof. Authenticated reads remain
  household-wide through a protected streaming route.
- Reverting to pending deletes proof metadata before best-effort R2 cleanup. Financial share
  recalculation returns displaced keys for the route to clean up; soft deletion retains proof.

### Email notifications

- `participants.email` is normalized and unique; it remains nullable only as a forward-compatible
  bridge for pre-existing household identities.
- Expense creation remains a single D1 batch. After it commits, the route loads only selected
  participants with emails and submits one Resend batch containing one message per recipient.
- Messages use `La cuenta <info@depto.parker.ci>`, include each recipient's exact integer share,
  and link to the protected expense detail on `APP_BASE_URL`.
- `expense-created/{expenseId}` is the Resend idempotency key. Missing configuration or provider
  failure is reported safely and never changes the `201` result for the committed expense.

### Rendering and interaction

- Protected layouts and read-heavy pages are Server Components that fetch D1 directly.
- Forms, filters, confirmation dialogs, reimbursement toggles, and receipt uploads are leaf Client
  Components calling shared fetch clients under `src/lib/api/`.
- Expense category lists are read server-side for forms and filters; root/admin category mutations
  use authenticated route handlers and a leaf icon-picker client component.
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
├── 0003_add_user_roles.sql
├── 0004_link_users_and_participants.sql
└── 0005_add_expense_kinds.sql

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

1. Bind and migrate native D1/R2 resources and generate binding types.
2. Bootstrap the one-time root account and manage subsequent accounts through role-gated UI/API.
3. Add PBKDF2 and Auth.js Credentials with rate limiting and complete route protection.
4. Implement exact splitting, database result wrappers, expense CRUD, and reimbursement updates.
5. Implement private receipt upload/view and compensating cleanup.
6. Build the Spanish dashboard, responsive expense flows, filters, and accessibility states.
7. Complete unit, binding integration, and browser flows; verify Next build and Workers preview.

## Complexity Tracking

No constitution violations or exceptional complexity are required.
