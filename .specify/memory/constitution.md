<!--
Sync Impact Report
- Version change: template → 1.0.0
- Added principles:
  - I. Specification Is the Source of Truth
  - II. Financial Integrity Is Non-Negotiable
  - III. Secure and Private by Default
  - IV. Cloudflare Runtime Parity and Simplicity
  - V. Spanish, Mobile-First, Accessible, and Tested
- Added sections: Technology and Product Constraints; Development Workflow and Quality Gates
- Removed sections: none
- Templates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md (already compatible)
  - ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: none
-->
# Gastos Compartidos Constitution

## Core Principles

### I. Specification Is the Source of Truth
Every product change MUST trace to a functional requirement, user scenario, or explicit
out-of-scope decision in `specs/`. Plans, tasks, implementation, tests, and documentation
MUST remain consistent with the specification. Any behavior-changing decision made during
implementation MUST update the relevant Spec Kit artifact before the change is considered
complete. Features outside the MVP scope MUST NOT be added without a specification amendment.

### II. Financial Integrity Is Non-Negotiable
Currency values MUST be represented as integer minor units and MUST NOT use floating-point
arithmetic for persistence or split calculation. Equal splits MUST be deterministic, assign
remainders by participant `sort_order`, and preserve the original expense total exactly.
Expense and share writes MUST be atomic. Paid reimbursement state MUST retain its audit time
and actor, and destructive expense operations MUST use the specified soft-delete behavior.
Automated tests MUST cover rounding, state transitions, recalculation, and summary totals.

### III. Secure and Private by Default
All expense, participant, reimbursement, and receipt data MUST require authentication at both
page and API boundaries. Passwords MUST use PBKDF2-SHA-256 through Web Crypto with a unique
salt and encoded work factor; plaintext passwords and secrets MUST never be persisted or
committed. Credentials MUST be validated server-side, failed login responses MUST be generic,
and attempts MUST be rate-limited by normalized username and client address. Receipt objects
MUST remain private in R2 and be returned only through authenticated routes. Every mutation
MUST validate its input and record the applicable audit fields.

### IV. Cloudflare Runtime Parity and Simplicity
The application MUST use Next.js App Router through OpenNext on Cloudflare Workers, D1 for
relational data, and R2 for receipt binaries. Server code MUST use Cloudflare bindings rather
than platform-specific filesystem or long-lived process assumptions. Local development and
tests MUST prefer Wrangler/Miniflare simulations because they use the production binding APIs;
Docker services MUST NOT be introduced while native D1 and R2 simulation meets the need.
Components MUST remain Server Components by default, with client boundaries limited to leaf
interactions. Architectural complexity requires an explicit justification in `plan.md`.

### V. Spanish, Mobile-First, Accessible, and Tested
User-facing MVP copy MUST be Spanish by default. Primary flows—sign in, add an expense, upload
a receipt, update a reimbursement, and check balances—MUST remain practical at phone widths.
Forms and controls MUST have visible labels, keyboard access, focus indicators, and meaningful
status or error text. Each completed story MUST include automated tests at the appropriate
unit, database, API, or browser boundary. Lint, TypeScript, tests, Next.js production build,
and an OpenNext Workers preview smoke test MUST pass before final delivery.

## Technology and Product Constraints

- Next.js 16+ App Router, React, TypeScript strict mode, and Tailwind CSS are mandatory.
- Auth.js v5 Credentials with JWT sessions is the authentication strategy for this MVP.
- D1 stores users, participants, expenses, shares, audit data, and receipt metadata only.
- R2 stores supported receipt images and PDFs, with a 10 MB server-enforced limit.
- The MVP has exactly Alvaro, Camila, and Trinidad and supports equal three-way CLP splits.
- The system MUST remain usable and responsive for at least 1,000 non-deleted expenses.

## Development Workflow and Quality Gates

1. Update `spec.md`, then `plan.md`, then `tasks.md` before implementing changed scope.
2. Write or update relevant automated tests before considering a behavior complete.
3. Keep database access in server-only modules and HTTP concerns in authenticated route handlers.
4. Apply D1 schema changes through numbered migrations and provide deterministic seed commands.
5. Run format checks, lint, type checks, tests, production build, and Workers preview checks.
6. Package every coherent change in a Conventional Commit; do not leave completed work uncommitted.
7. Never commit credentials, production resource identifiers, uploaded receipts, or local state.

## Governance

This constitution governs all project artifacts and supersedes conflicting implementation
convenience. Amendments MUST document the reason, update the Sync Impact Report, propagate to
dependent templates and feature artifacts, and use semantic versioning: MAJOR for incompatible
principle changes, MINOR for added or materially expanded rules, and PATCH for clarifications.
Every plan MUST pass the Constitution Check before implementation and after design. Code review
and final delivery MUST verify requirement traceability, security, financial correctness,
quality gates, and Conventional Commit packaging. Exceptions require a documented, time-bounded
justification in the plan's Complexity Tracking section.

**Version**: 1.0.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-07-09
