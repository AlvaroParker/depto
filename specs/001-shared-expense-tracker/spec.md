# Feature Specification: Shared Expense Tracker

**Feature Branch**: `001-shared-expense-tracker`

**Created**: 2026-07-09

**Status**: Approved for planning

**Input**: Replace the household Excel tracker with a private, mobile-friendly application where
regular users are household participants, can choose who joins each expense, keep receipts, split
costs equally, and track reimbursements.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign in and keep household data private (Priority: P1)

As a household user, I sign in with my username and password so that only the
household can view or change shared financial data.

**Why this priority**: Every other journey handles private financial or receipt data and cannot
be released safely without access control.

**Independent Test**: Sign in with a valid managed account, attempt an invalid sign-in, and request
each protected page and data operation without a session.

**Acceptance Scenarios**:

1. **Given** a valid active user, **When** the correct username and password are submitted,
   **Then** the user is authenticated and sees the dashboard.
2. **Given** invalid credentials or a disabled account, **When** sign-in is attempted,
   **Then** the same generic error is shown and no account details are disclosed.
3. **Given** no valid session, **When** a protected page or data operation is requested,
   **Then** page access redirects to sign-in and data operations return no household data.
4. **Given** repeated failed attempts from one username or network address, **When** the limit is
   reached, **Then** further attempts are temporarily rejected with a generic response.

---

### User Story 2 - Record and inspect a shared expense (Priority: P1)

As an authenticated household user, I record an expense, its payer, and its participants so that
the application creates an exact equal split for that group and everyone can inspect the result.

**Why this priority**: Recording correctly split expenses is the core replacement for the current
spreadsheet.

**Independent Test**: Create expenses with different selected groups and totals, then view the list
and detail to verify the stored expense and exactly one share per selected participant.

**Acceptance Scenarios**:

1. **Given** three active participants, **When** only two are selected for a 30,000 CLP expense,
   **Then** two 15,000 CLP shares are created, the payer is settled, and the other is pending.
2. **Given** a 10,000 CLP expense with three selected participants, **When** it is split, **Then**
   shares are 3,334, 3,333, and 3,333 CLP in participant order and sum exactly to 10,000 CLP.
3. **Given** invalid or missing required form values, **When** the expense is submitted,
   **Then** nothing is created and visible field-specific errors explain what must be corrected.
4. **Given** recorded expenses, **When** the expense list is opened, **Then** each item shows date,
   name, amount, payer, receipt presence, reimbursement state, and view/edit/delete actions.

---

### User Story 3 - Understand balances and record reimbursements (Priority: P1)

As an authenticated household user, I see who owes whom and mark reimbursements paid or pending
so that the dashboard always represents the household's current position.

**Why this priority**: The household needs an actionable answer, not only a history of purchases.

**Independent Test**: Create an expense, toggle one non-payer share paid and pending, and verify
the detail plus all dashboard totals after each transition.

**Acceptance Scenarios**:

1. **Given** a pending non-payer share, **When** it is marked paid, **Then** the status, payment
   time, and marking user are recorded and its amount leaves the pending reimbursement summary.
2. **Given** a paid non-payer share, **When** it is returned to pending, **Then** payment time and
   marking user are cleared and its amount returns to the pending summary.
3. **Given** any expense, **When** its detail is opened, **Then** its selected participants and their
   settled, pending, or paid state are visible; the payer's settled state cannot be changed.
4. **Given** multiple expenses, **When** the dashboard is opened, **Then** it shows expense count,
   total spend, total paid and total share by participant, net balances, total pending, and an
   aggregated from/to reimbursement list.

---

### User Story 4 - Attach and privately view a receipt (Priority: P2)

As an authenticated household user, I attach a supported receipt image or PDF so that the proof
of purchase remains available to the household without becoming public.

**Why this priority**: Receipts support verification and replace spreadsheet links, but expense
and reimbursement tracking still delivers value without an attachment.

**Independent Test**: Upload each supported type below the size limit, reject unsupported or
oversized files, reload the expense, and test receipt access with and without a session.

**Acceptance Scenarios**:

1. **Given** a JPEG, PNG, WebP, or PDF no larger than 10 MB, **When** it is attached,
   **Then** the receipt metadata is associated with the expense and the file can be opened by an
   authenticated user.
2. **Given** an unsupported type or a file larger than 10 MB, **When** upload is attempted,
   **Then** the file is rejected before attachment with a clear Spanish error.
3. **Given** a stored receipt, **When** an unauthenticated request tries to read or enumerate it,
   **Then** no receipt content or object listing is returned.
4. **Given** an upload succeeds but expense saving fails, **When** recovery runs,
   **Then** the unattached object is safe to retry or identify for later cleanup.

---

### User Story 5 - Correct or remove an expense safely (Priority: P2)

As an authenticated household user, I edit incorrect expense details or remove an expense so that
the current tracker remains accurate without silently corrupting reimbursement history.

**Why this priority**: Real household entries are sometimes wrong and require controlled repair.

**Independent Test**: Edit descriptive fields, edit amount or payer with a paid reimbursement,
replace a receipt, and delete an expense while verifying status and dashboard effects.

**Acceptance Scenarios**:

1. **Given** an expense, **When** only name, description, date, or receipt changes,
   **Then** existing reimbursement states are unchanged.
2. **Given** an amount or payer change, **When** the user confirms the reset warning,
   **Then** all shares are recalculated exactly, the payer is settled, and non-payers are pending.
3. **Given** an amount or payer change would replace a paid reimbursement, **When** confirmation
   is not provided, **Then** the change is rejected and existing data remains unchanged.
4. **Given** an expense is deleted, **When** normal lists and totals are viewed,
   **Then** it is hidden and excluded while its receipt remains retained for audit purposes.

---

### User Story 6 - Find expenses quickly on a phone (Priority: P3)

As an authenticated household user, I search, filter, and sort the expense history from a phone
so that I can find entries and complete frequent tasks with minimal navigation.

**Why this priority**: This improves everyday usability after the complete core workflow exists.

**Independent Test**: At a 360-pixel viewport, search names and descriptions, apply payer and
pending filters, and complete add expense, receipt, reimbursement, and balance-check flows using
keyboard and touch input.

**Acceptance Scenarios**:

1. **Given** multiple expenses, **When** no filters are applied, **Then** entries are ordered by
   expense date newest first with a deterministic tie breaker.
2. **Given** a search term or payer/pending filter, **When** it is applied,
   **Then** only matching non-deleted expenses appear and the active filter is clear.
3. **Given** a phone-width viewport, **When** core pages are used, **Then** content fits without
   horizontal scrolling and primary actions remain visible and touch-friendly.
4. **Given** keyboard-only input, **When** a user navigates forms and controls,
   **Then** labels, focus state, activation, errors, and status changes remain perceivable.

### User Story 7 - Bootstrap and administer access (Priority: P1)

As the person deploying the tracker, I create the permanent root account once and then manage
administrator and regular-user access while keeping household participants and audit data aligned.

**Independent Test**: Start with a migrated empty database, create root through setup, sign in,
create an admin, use root and that admin to update a regular user's names and password, create and
remove users and another admin, and attempt to modify or remove root.

**Acceptance Scenarios**:

1. **Given** no root exists, **When** the first-run form is completed, **Then** exactly one root is
   created, signed in, and the setup endpoint closes.
2. **Given** a root or admin session, **When** a regular user is created, **Then** its participant is
   created atomically; when an admin is created, no participant is created.
3. **Given** an admin or regular user, **When** root or another admin removes the account, **Then**
   access is revoked while historical financial references remain.
4. **Given** the root account, **When** any application or direct database action tries to delete,
   disable, demote, or duplicate it, **Then** the operation is rejected.
5. **Given** a regular user, **When** user administration is requested, **Then** the UI is hidden and
   the API returns a forbidden response.
6. **Given** a regular-user account, **When** root or an admin changes its display name, username,
   and optionally its password, **Then** the updated identity appears immediately and the new
   credentials can sign in, its participant name stays synchronized, and admin and root accounts
   remain unavailable for editing.

### Edge Cases

- Amounts smaller than the selected participant count still produce non-negative shares whose sum is exact.
- Adding a user never adds a share to an existing expense; historical participant sets are immutable
  until that expense is explicitly edited.
- Expenses on the same date have stable ordering and do not disappear between page loads.
- A participant or user referenced by existing records is never hard-deleted by MVP flows.
- An expired session during a mutation produces no partial financial write.
- Concurrent reimbursement updates settle on one valid state with consistent audit fields.
- Editing an expense with a new receipt does not expose or lose the previous object unexpectedly.
- A missing receipt object returns a safe not-found state without leaking its storage key.
- No expenses and no pending reimbursements produce useful Spanish empty states and zero totals.
- Search treats leading/trailing whitespace safely and does not alter stored data.
- Very long names, descriptions, filenames, and malformed dates are rejected at documented limits.
- Concurrent first-run requests can create at most one root account.
- Root cannot be deleted, disabled, demoted, or duplicated through application or direct D1 writes.
- Removing an admin or user revokes access while preserving historical financial references.
- Updating a regular user to an occupied username is rejected without changing any credentials.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST require username/password sign-in before any household expense,
  participant, reimbursement, or receipt data can be viewed or changed. It MUST initialize root
  through one-time setup, store only password hashes, return generic failures, reject disabled
  users, and rate-limit repeated failures by username and client address.
- **FR-002**: The dashboard MUST show expense count, total amount spent, total paid by each
  participant, total share attributed to each participant, net balance by participant, total
  pending reimbursements, an aggregated from/to pending matrix, and recent expenses.
- **FR-003**: The system MUST provide a mobile-usable list of all non-deleted expenses showing
  date, name, amount, payer, receipt presence, reimbursement state, and view/edit/delete actions.
- **FR-004**: An authenticated user MUST be able to create an expense with required name, positive
  amount, currency, date, payer, and one or more selected participants plus optional description and
  receipt. The payer MUST be selected. Creation MUST atomically create one share for each selected
  participant. Integer remainder units MUST be assigned by participant
  order so that shares always sum exactly to the original amount.
- **FR-005**: The system MUST mark the payer's share settled automatically, start each non-payer
  share pending, allow non-payer shares to change between pending and paid, record payment time and
  marking user for paid state, and clear those fields when reverting to pending.
- **FR-006**: Authenticated users MUST be able to upload JPEG, PNG, WebP, and PDF receipts up to
  and including 10 MB. Only receipt metadata and an opaque object reference may be associated with
  the expense. Receipt content and object listings MUST never be publicly accessible.
- **FR-007**: Authenticated users MUST be able to edit every expense field. Descriptive, date, and
  receipt-only changes MUST preserve reimbursement state. Amount or payer changes MUST require an
  explicit confirmation when paid states exist, recalculate all shares, and reset non-payers to
  pending only after confirmation.
- **FR-008**: Authenticated users MUST be able to soft-delete an expense. Deleted expenses MUST be
  hidden from normal views and excluded from calculations while their receipt is retained for audit.
- **FR-009**: The expense list MUST sort newest expense date first and support search by name or
  description, payer filtering, and pending-reimbursement filtering. Filters MUST be combinable.
- **FR-010**: The application MUST present Spanish user-facing labels and make add expense, receipt
  upload, reimbursement update, and balance checking efficient at phone widths and by keyboard.
- **FR-011**: Every regular user MUST map one-to-one to a participant created in the same atomic
  operation. Root and admin accounts MUST NOT map to participants. Disabling or renaming a regular
  user MUST update future participant availability or display name without deleting history.
- **FR-012**: Every mutation MUST validate input on the server and record applicable creator,
  updater time, payment marker, and payment time audit data.
- **FR-013**: Expense creation and amount/payer recalculation MUST be all-or-nothing operations;
  failure MUST leave neither a partial expense nor a partial set of shares.
- **FR-014**: The system MUST provide Spanish empty, loading, validation, authorization, not-found,
  and unexpected-error states without exposing internal details.
- **FR-015**: A migrated database without a root user MUST redirect sign-in to a one-time setup flow
  that creates and signs in the first root account. Once root exists, setup MUST reject further root creation.
- **FR-016**: Every application user MUST have exactly one role: `root`, `admin`, or `user`. Root and
  admin MUST be authorized to manage accounts; regular users MUST be denied those operations.
- **FR-017**: Root and admin MUST be able to create regular users and admins, update regular users'
  usernames, display names, and passwords, and remove other non-root accounts. Account removal MUST
  preserve financial audit references and revoke future session access. Admin and root identities
  MUST NOT be editable through the regular-user update operation.
- **FR-018**: The system MUST enforce exactly one immutable, active, non-deletable root at the database
  and application layers. No authenticated management endpoint may accept `root` as a new account role.

### Key Entities

- **Application User**: A private household login with username, display name, one hierarchical role,
  a required participant link for regular users only, password verifier, timestamps, and optional disabled state.
- **Participant**: A regular user's stable expense identity and ordering used for split remainder assignment.
- **Expense**: A named shared cost with optional description, integer amount, currency, date,
  payer, optional receipt reference and metadata, creator, timestamps, and optional deletion time.
- **Expense Share**: One participant's exact portion of an expense, its settled/pending/paid state,
  payment recipient, optional payment time and marking user, and timestamps.
- **Receipt**: A private image or PDF object plus filename, media type, size, and opaque association
  reference; binary content is separate from financial records.
- **Login Attempt Window**: Failed-attempt counters grouped by normalized username and client
  address with an expiry used to enforce temporary sign-in limits.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All protected pages and operations reject unauthenticated access in automated tests,
  while managed regular users can successfully sign in with valid credentials.
- **SC-002**: For every positive amount and selected group exercised by the test suite, generated
  shares are deterministic, non-negative, and sum exactly to the expense amount.
- **SC-003**: A user can record a typical expense with a phone-sized interface in under 60 seconds
  and no more than one navigation away from the dashboard.
- **SC-004**: A reimbursement state change is visible in expense detail and dashboard pending totals
  on the next view, with the actor and time correct for 100% of tested transitions.
- **SC-005**: Valid receipts at the 10 MB boundary remain available to authenticated users after a
  reload, and 100% of unauthenticated receipt requests in the security suite return no content.
- **SC-006**: Dashboard and expense-list views complete in under one second under normal local test
  conditions with 1,000 expenses.
- **SC-007**: At a 360-pixel viewport, all primary workflows complete without horizontal scrolling,
  and all interactive controls can be operated with a keyboard and have visible labels and focus.
- **SC-008**: Search and combined filters return the expected result set for all acceptance fixtures,
  always ordered newest first.
- **SC-009**: The delivered repository passes all automated tests and production readiness checks,
  and contains no plaintext password, secret, uploaded receipt, or production resource identifier.
- **SC-010**: Automated tests prove one-time root bootstrap, database-enforced root immutability,
  regular-user denial, root/admin updates of regular-user identity and credentials, and admin
  creation/removal of both users and other admins.

## Assumptions

- Regular-user management is participant management; each expense independently chooses any
  non-empty subset of active participants. Unequal splits are not required.
- CLP is the default and primary currency, amounts are entered as whole minor units, and no currency
  conversion is performed.
- Accounts use one hierarchical `root`, `admin`, or `user` role. There is no public signup; the only
  unauthenticated account creation path is the one-time root bootstrap before root exists.
- Expense dates are calendar dates selected by the user and displayed using Chilean Spanish locale.
- Soft-deleted expenses and their receipts are retained for audit until a future retention policy is
  specified; they are not exposed through normal user flows.
- The household has ordinary internet connectivity; offline entry, installation, and notifications
  are future enhancements.

## Out of Scope

- Unequal splits, multiple households, or participant identities independent from regular users.
- Public registration, password reset email, email or push notifications.
- Multi-currency conversion, bank integration, settlement optimization, or accounting exports.
- Receipt OCR, parsing, image enhancement, and offline-first or installable application behavior.
