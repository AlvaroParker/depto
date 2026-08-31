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

As an authenticated household user, I record an expense, its payer, and its share recipients so that
the application creates an exact equal split for that group and everyone can inspect the result.

**Why this priority**: Recording correctly split expenses is the core replacement for the current
spreadsheet.

**Independent Test**: Create expenses with different selected groups and totals, then view the list
and detail to verify the stored expense and exactly one share per selected participant.

**Acceptance Scenarios**:

1. **Given** three active participants, **When** only two are selected as share recipients for a
   30,000 CLP expense, **Then** exactly two 15,000 CLP shares are created. A selected payer's share
   is settled; an external payer receives no synthetic share and both recipients owe that payer.
2. **Given** a 10,000 CLP expense with three selected participants, **When** it is split, **Then**
   shares are 3,334, 3,333, and 3,333 CLP in participant order and sum exactly to 10,000 CLP.
3. **Given** invalid or missing required form values, **When** the expense is submitted,
   **Then** nothing is created and visible field-specific errors explain what must be corrected.
4. **Given** recorded expenses, **When** the expense list is opened, **Then** each item shows date,
   name, amount, payer, receipt presence, reimbursement state, and view/edit/delete actions.
5. **Given** selected non-payers who already reimbursed the payer, **When** the creator marks them
   paid while creating the expense, **Then** their shares start paid with the creator and creation
   time recorded while every unchecked non-payer starts pending.
6. **Given** an active payer outside the selected share recipients, **When** an equal or custom
   expense is created, **Then** the payer remains the reimbursement recipient without receiving a
   share. An open expense instead requires the payer among its share recipients.

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
4. **Given** a signed-in regular user linked to a participant, **When** the dashboard is opened,
   **Then** it shows what they owe, what others owe them, a descending per-participant debt
   breakdown, their current cash spend, their final allocated share, and only recent expenses in
   which they participate.
5. **Given** a signed-in root or admin without a participant, **When** the dashboard is opened,
   **Then** it shows expense count, total spend, total paid and total share by participant, net
   balances, total pending, and an aggregated from/to reimbursement list.
6. **Given** a pending share owned by the signed-in participant, **When** they mark it paid,
   **Then** they may optionally attach one JPEG, PNG, or WebP payment proof up to 10 MB and the
   proof is associated with that exact share amount.
7. **Given** a paid share with proof, **When** its owner or a root/admin replaces the proof,
   **Then** the original payment audit time remains unchanged and only the replacement is current.
8. **Given** a paid share with proof, **When** it is returned to pending, **Then** the proof metadata
   and object are removed together with the paid audit fields.
9. **Given** a stored payment proof, **When** any authenticated household user opens it,
   **Then** it is streamed privately; unauthenticated requests receive no content.
10. **Given** the signed-in participant owes one person through multiple pending expense shares,
    **When** they select “Pagar todo” and confirm, **Then** every positive pending share owed by
    that participant to that person is marked paid with one audit time and actor.
11. **Given** a bulk payment includes an optional valid payment proof, **When** it succeeds,
    **Then** the proof is visible from every affected expense share while the bytes are stored once.
12. **Given** two participants owe each other through different expenses, **When** one uses
    “Pagar todo,” **Then** only their outgoing shares are paid and the opposite debt is unchanged.

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
3. **Given** a signed-in regular user with pending shares, **When** they select “Mis pagos
   pendientes,” **Then** only expenses where their participant owes the payer appear and each item
   emphasizes the amount they owe.
4. **Given** a phone-width viewport, **When** core pages are used, **Then** content fits without
   horizontal scrolling and primary actions remain visible and touch-friendly.
5. **Given** keyboard-only input, **When** a user navigates forms and controls,
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

### User Story 8 - Categorize household expenses (Priority: P2)

As a household user, I assign a recognizable category to each expense so that the history is easy
to scan and filter; as an administrator, I maintain the shared category names and icons.

**Independent Test**: Create and edit a category as root or admin, use it on an expense, inspect its
icon in list and detail views, filter history by it, and verify a regular user cannot manage it.

**Acceptance Scenarios**:

1. **Given** a migrated household, **When** expense forms and history are opened, **Then** the seeded
   household categories are available and existing expenses appear under “Otros.”
2. **Given** an authenticated user, **When** an expense is created or edited, **Then** it stores one
   required category and displays the category name and Lucide icon in summary and detail views.
3. **Given** root or admin, **When** a unique category name and allowed icon are submitted, **Then**
   the category becomes available to all expense forms and can later be renamed or given another icon.
4. **Given** a regular user, **When** category administration is requested, **Then** the UI is hidden,
   the page redirects to settings, and management APIs return forbidden.
5. **Given** categorized expenses, **When** a category filter is combined with other history filters,
   **Then** only matching non-deleted expenses are returned with stable pagination and ordering.

### User Story 9 - Notify participants about a new expense (Priority: P2)

As a selected participant, I receive an email when a household expense is created so that I know
the expense, payer, and exact amount assigned to me without repeatedly checking the application.

**Independent Test**: Create an expense with participants that have distinct emails, capture the
Resend batch request, and verify one private message per selected participant with the exact share.

**Acceptance Scenarios**:

1. **Given** selected participants with configured emails, **When** an expense is created, **Then**
   each receives an individual message from `info@depto.parker.ci` with the expense total, payer,
   date, their exact share, and an authenticated detail link.
2. **Given** a participant not selected for the expense, **When** it is created, **Then** no message
   is addressed to that participant.
3. **Given** Resend is unavailable or unconfigured, **When** expense creation succeeds, **Then** the
   financial record remains committed and the notification failure is logged without exposing secrets.

### User Story 10 - Choose specific or participant-managed shares (Priority: P1)

As an expense creator, I choose equal, specific, or open splitting so that unequal household costs
remain exact while an open bill can leave pending contribution decisions to each participant.

**Independent Test**: Create one expense with exact custom amounts and one open expense, change an
open pending share as its owner, and verify the payer remainder and all dashboard totals stay exact.

**Acceptance Scenarios**:

1. **Given** selected participants and a positive total, **When** the creator enters one non-negative
   custom amount per participant, **Then** creation succeeds only when those amounts sum exactly to
   the expense total.
2. **Given** a new open expense, **When** the creator accepts the initial values, **Then** exact equal
   suggestions are active immediately and included in balances.
3. **Given** an open pending non-payer share, **When** its owner or root/admin changes the amount,
   **Then** that amount and the payer's settled remainder update atomically and still sum to the total.
4. **Given** an open share already marked paid, **When** an amount change is attempted, **Then** it
   remains locked until the owner or root/admin returns it to pending.
5. **Given** a zero allocation, **When** expense state is summarized, **Then** the participant stays
   associated but the share is not counted as pending and cannot be marked paid.
6. **Given** a payer outside the proposed open-expense recipients, **When** creation or editing is
   attempted, **Then** validation rejects it because the payer remainder requires a payer share.

### User Story 11 - Keep useful household information together (Priority: P2)

As a household user, I view service references and payment links in one protected directory so that
I can handle common bills without asking an administrator where the information is stored.

**Independent Test**: Create and edit a water-service card as root/admin, view it as a regular user,
then archive it and verify it no longer appears in normal reads.

**Acceptance Scenarios**:

1. **Given** an authenticated household user, **When** they open Casa, **Then** active information
   cards show their provider, customer reference, payment link, notes, and ordered custom fields.
2. **Given** root or admin, **When** a preset or custom card is submitted, **Then** its common data
   and additional fields are validated and written atomically.
3. **Given** a regular user, **When** they attempt any household-information mutation, **Then** the
   interface offers no management controls and the API returns forbidden.
4. **Given** a configured customer reference or payment URL, **When** a user activates its action,
   **Then** the reference can be copied and only an HTTP/HTTPS external link can be opened.
5. **Given** multiple cards with the same service type, **When** Casa is opened, **Then** all remain
   available in stable administrator-created order.
6. **Given** an archived card, **When** any normal page or API read occurs, **Then** it is excluded
   while its data and updater audit fields remain stored.

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
- Category names are unique case-insensitively, and arbitrary icon names are rejected.
- Renaming a category updates its display on historical expenses without changing financial state.
- Participant emails are unique case-insensitively; migrated participants without an email remain
  usable but are skipped until an administrator adds one.
- Retrying delivery for the same expense does not create duplicate email batches.
- Concurrent open-share updates cannot produce negative payer shares or a total different from the expense.
- A regular user cannot bypass open-share ownership by changing the expense's financial structure.
- Duplicate custom labels within one household-information card are rejected case-insensitively.
- A failed additional-field insert leaves no partial household-information item or partial update.
- Unsafe link protocols and cards with no useful information beyond a title are rejected.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST require username/password sign-in before any household expense,
  participant, reimbursement, or receipt data can be viewed or changed. It MUST initialize root
  through one-time setup, store only password hashes, return generic failures, reject disabled
  users, and rate-limit repeated failures by username and client address.
- **FR-002**: For a regular user linked to a participant, the dashboard MUST show their pending
  outgoing amount and expense count, pending incoming amount and expense count, a descending
  per-participant breakdown that keeps both directions visible, current cash spend, final allocated
  share, and recent expenses where they paid or received a share. For root or admin accounts without
  a participant, it MUST show expense count, total amount spent, total paid and share by participant,
  net balances, total pending reimbursements, an aggregated from/to pending matrix, and household
  recent expenses.
- **FR-003**: The system MUST provide a mobile-usable list of all non-deleted expenses showing
  date, name, amount, payer, receipt presence, reimbursement state, and view/edit/delete actions.
- **FR-004**: An authenticated user MUST be able to create an expense with required name, positive
  amount, currency, date, payer, and one or more selected share recipients plus optional description,
  receipt, and a unique subset of selected non-payers who already reimbursed the payer. The payer
  MUST be active and MUST NOT appear in the initially paid subset. Equal and custom expenses MAY
  keep the payer outside the selected recipients; open expenses MUST select the payer. Creation MUST
  atomically create one share for each selected recipient and no synthetic payer share. Integer
  remainder units MUST be assigned by participant order so that shares always sum exactly to the
  original amount.
- **FR-005**: The system MUST mark the payer's share settled automatically when the payer is a share
  recipient, start checked non-payer shares paid and unchecked non-payer shares pending, allow
  non-payer shares to change between pending and paid, record the expense creator and creation time
  for initially paid shares, record the payment time and marking user for every later paid
  transition, and clear those fields when reverting to pending.
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
  description, payer filtering, household pending-reimbursement filtering, and a regular-user-only
  filter for expenses where the current user's participant has a pending share owed to the payer.
  Filters MUST be combinable.
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
- **FR-019**: Every expense MUST reference one valid shared category. A migration MUST seed household
  categories and assign existing expenses to “Otros.” Expense summaries and details MUST include the
  category name and an icon selected from a typed Lucide registry.
- **FR-020**: Root and admin MUST be able to create and edit globally shared category names and icons;
  regular users MUST be denied those management operations. Category names MUST be unique
  case-insensitively, and categories referenced by history MUST NOT be deleted.
- **FR-021**: Expense history MUST support a category filter combinable with search, payer, pending
  state, sorting, and pagination.
- **FR-022**: During atomic expense creation, any authenticated creator MAY initialize any selected
  non-payer share as paid. After creation, a regular user MUST be able to mark only their own
  non-payer share paid or pending. Root and admin MAY update any non-payer share. Other
  authenticated users MUST be denied.
- **FR-023**: The share owner, root, or admin MUST be able to optionally upload one current JPEG,
  PNG, or WebP payment proof up to and including 10 MB while marking a share paid, or add or replace
  it later without changing the original payment audit fields.
- **FR-024**: Payment-proof metadata MUST be associated one-to-one with the paid expense share while
  the binary remains in private R2. Any authenticated user MAY view proof for an active expense, but
  no object key, public URL, or bucket listing may be exposed.
- **FR-025**: Reverting a paid share to pending MUST remove its current proof. Confirmed financial
  recalculation MUST remove proofs for replaced shares, while soft-deleted expenses retain proofs
  privately for audit.
- **FR-026**: Every newly created regular user MUST supply one normalized, unique email stored on
  its one-to-one participant; root and admin accounts MUST NOT own participant email identities.
- **FR-027**: After a successful expense creation, the system MUST send one private notification to
  every selected participant with a configured email. Each message MUST identify the expense,
  creator, payer, date, total, recipient's exact share, and authenticated detail link, using
  `info@depto.parker.ci` as the sender address.
- **FR-028**: Email delivery MUST use an idempotent Resend batch request. Provider failure MUST NOT
  roll back or hide the committed financial record, and logs MUST NOT contain API keys or recipient data.
- **FR-029**: Every expense MUST store exactly one split mode: equal, custom, or open. Existing and
  omitted-mode expenses MUST remain equal for compatibility.
- **FR-030**: Custom and open creation MUST accept exactly one non-negative integer allocation per
  selected share recipient and reject duplicates, missing recipients, unsafe integers, or totals
  that differ from the expense amount. Equal splitting MUST retain deterministic remainder ordering.
  Open creation MUST include the payer among those recipients.
- **FR-031**: Open expenses MUST initialize with equal suggested allocations by default while
  permitting the creator to enter arbitrary exact amounts and mark positive non-payer amounts paid.
- **FR-032**: The owner of an open pending non-payer share and root/admin MUST be able to change its
  amount. Each mutation MUST atomically set the payer's settled share to the remaining amount and
  reject any update that would make that remainder negative.
- **FR-033**: Paid open shares MUST remain amount-locked until reverted to pending. Zero shares MUST
  remain associated and editable, but MUST NOT be payable or included in pending counts and balances.
- **FR-034**: Only root/admin MAY change the total, payer, participant set, allocations, or split
  mode of an existing open expense. Other authenticated users MAY retain existing descriptive edits.
- **FR-035**: Every authenticated user MUST be able to view active household-information cards from
  a dedicated Casa page; unauthenticated requests MUST reveal no card data.
- **FR-036**: Root and admin MUST be able to create, edit, and archive household-information cards,
  while regular users MUST be denied all mutations at both interface and API boundaries.
- **FR-037**: A card MUST store a typed name, semantic icon, optional provider, customer reference,
  HTTP/HTTPS payment URL, notes, stable order, and creator/updater audit fields. Multiple cards with
  the same service preset MUST be allowed.
- **FR-038**: A card MAY contain ordered custom text or link fields with unique case-insensitive
  labels. Parent and custom-field writes MUST be atomic and reject partial state.
- **FR-039**: Household information MUST NOT accept files, passwords, access codes, API keys, or
  other secrets; all accepted values are visible to every authenticated household user.
- **FR-040**: A participant-linked actor MUST be able to atomically mark every positive pending
  share they owe to one selected participant as paid, without netting or mutating debts in the
  opposite direction, already-paid shares, zero shares, settled shares, or deleted expenses.
- **FR-041**: The personal dashboard MUST expose “Pagar todo” only for outgoing debt, identify the
  affected expense count and total before confirmation, and explain any simultaneous opposite debt.
- **FR-042**: A bulk payment MAY include one valid payment proof. The system MUST associate that
  proof with every affected share, store its private bytes once, and retain the object until its final
  proof association is replaced or removed.

### Key Entities

- **Application User**: A private household login with username, display name, one hierarchical role,
  a required participant link for regular users only, password verifier, timestamps, and optional disabled state.
- **Participant**: A regular user's stable expense identity, unique notification email, and ordering
  used for split remainder assignment.
- **Expense**: A named shared cost with optional description, integer amount, currency, date,
  required category, payer, equal/custom/open split mode, optional receipt reference and metadata,
  creator, timestamps, and optional deletion time.
- **Expense Kind**: A shared category with a unique display name, stable semantic icon key, ordering,
  and timestamps. It is editable by root/admin and retained for historical references.
- **Expense Share**: One participant's exact portion of an expense, its settled/pending/paid state,
  payment recipient, optional payment time and marking user, and timestamps.
- **Payment Proof**: One optional private image association on a paid expense share, including safe
  filename, image media type, size, uploader, upload time, and an opaque R2 reference. Bulk-created
  associations may reference one shared object while remaining independently replaceable.
- **Receipt**: A private image or PDF object plus filename, media type, size, and opaque association
  reference; binary content is separate from financial records.
- **Login Attempt Window**: Failed-attempt counters grouped by normalized username and client
  address with an expiry used to enforce temporary sign-in limits.
- **Household Information Item**: One active or archived household reference card with typed common
  service data, ordered open fields, display order, and creator/updater audit information.

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
- **SC-011**: Automated tests prove owner/admin payment-proof authorization, all supported image
  formats at the 10 MB boundary, private authenticated reads, replacement, reversion cleanup, and
  successful paid transitions without proof.
- **SC-012**: Automated tests prove selected participants receive isolated messages containing
  their exact shares, non-selected or email-less participants receive none, and provider failure
  leaves the successfully created expense intact.
- **SC-013**: Automated tests prove multiple selected non-payers can start paid with exact creator
  audit data, invalid initial selections write nothing, and initial paid shares are excluded from
  pending aggregates and filters.
- **SC-014**: Automated tests prove custom and open allocations remain non-negative and exact across
  creation, owner/admin open updates, zero allocations, paid locking, concurrent writes, and mode conversion.
- **SC-015**: Automated tests prove authenticated household-wide reads, root/admin-only atomic
  management, multiple same-service cards, safe links, stable ordering, and archive exclusion.

## Assumptions

- Regular-user management is participant management; each expense independently chooses any
  non-empty subset of active participants and one of the supported split modes.
- CLP is the default and primary currency, amounts are entered as whole minor units, and no currency
  conversion is performed.
- Accounts use one hierarchical `root`, `admin`, or `user` role. There is no public signup; the only
  unauthenticated account creation path is the one-time root bootstrap before root exists.
- Expense dates are calendar dates selected by the user and displayed using Chilean Spanish locale.
- Soft-deleted expenses and their receipts are retained for audit until a future retention policy is
  specified; they are not exposed through normal user flows.
- Payment proofs are optional evidence tied to the stored share amount. They are not parsed, OCRed,
  amount-verified, or subject to a separate payer approval state.
- The household has ordinary internet connectivity; offline entry and installation are future enhancements.
- Household information is non-secret reference data entered through forms; files and encrypted
  credential storage require a separate future security design.

## Out of Scope

- Multiple households or participant identities independent from regular users.
- Public registration, password reset email, or push notifications.
- Multi-currency conversion, bank integration, settlement optimization, or accounting exports.
- Receipt OCR, parsing, image enhancement, and offline-first or installable application behavior.
- Household document uploads, secret storage, archive restoration, and manual card reordering.
