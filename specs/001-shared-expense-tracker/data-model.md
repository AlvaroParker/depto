# Data Model: Shared Expense Tracker

All identifiers are text UUIDs unless a fixed seed identifier is specified. Timestamps are UTC ISO
8601 text. Calendar expense dates use `YYYY-MM-DD`. Money is an integer in the currency's minor unit.

## Participant

Represents a person included in every equal split.

| Field        | Type    | Rules                                           |
| ------------ | ------- | ----------------------------------------------- |
| `id`         | text    | Primary key; fixed seeded identifier            |
| `name`       | text    | Required; display name                          |
| `slug`       | text    | Required; unique normalized name                |
| `sort_order` | integer | Required; unique; controls remainder allocation |
| `active`     | integer | `0` or `1`; defaults to `1`                     |
| `created_at` | text    | Required UTC timestamp                          |
| `updated_at` | text    | Required UTC timestamp                          |

Seed order is `participant_alvaro` (1), `participant_camila` (2), and
`participant_trinidad` (3). Existing participants are not deleted in MVP flows.

## Application User

Represents a private credentials login and optional participant identity.

| Field            | Type | Rules                                                    |
| ---------------- | ---- | -------------------------------------------------------- |
| `id`             | text | Primary key                                              |
| `username`       | text | Required; unique case-insensitive normalized value       |
| `password_hash`  | text | Required; self-describing PBKDF2 value                   |
| `display_name`   | text | Required                                                 |
| `participant_id` | text | Nullable foreign key to participant; unique when present |
| `role`           | text | Required; exactly `root`, `admin`, or `user`             |
| `created_at`     | text | Required UTC timestamp                                   |
| `updated_at`     | text | Required UTC timestamp                                   |
| `disabled_at`    | text | Nullable UTC timestamp                                   |

Every account has one hierarchical role. Multiple simultaneous roles are intentionally unsupported:
`root` and `admin` already include user-management privileges, so role sets would add ambiguity
without granting useful capabilities. A partial unique index permits at most one `root`. Database
triggers prevent deleting, disabling, or changing the role of that root account. Other account
deletions set `disabled_at` so financial audit foreign keys remain intact.

On a fresh database, `/setup` creates root once. The optional local seed creates `alvaro`, `camila`,
and `trinidad` as regular users; passwords are accepted only from process environment, hashed before
insertion, and never written to repository files. The E2E harness can explicitly promote its
disposable Alvaro fixture to root.

## Login Attempt Window

Tracks repeated failed credentials attempts without retaining raw attempted identity values.

| Field               | Type    | Rules                                     |
| ------------------- | ------- | ----------------------------------------- |
| `scope`             | text    | `username` or `ip`; composite primary key |
| `key_hash`          | text    | SHA-256 base64url; composite primary key  |
| `attempt_count`     | integer | Non-negative                              |
| `window_started_at` | text    | Required UTC timestamp                    |
| `locked_until`      | text    | Nullable UTC timestamp                    |
| `updated_at`        | text    | Required UTC timestamp                    |

Expired unlocked rows may be removed opportunistically. An attempt is blocked while either matching
row has `locked_until` after the current time.

## Expense

Represents a shared household cost.

| Field                    | Type    | Rules                                                    |
| ------------------------ | ------- | -------------------------------------------------------- |
| `id`                     | text    | Primary key                                              |
| `name`                   | text    | Required; trimmed; 1–120 characters                      |
| `description`            | text    | Nullable; at most 2,000 characters                       |
| `amount_minor`           | integer | Required; greater than zero; safe integer                |
| `currency`               | text    | Required ISO-style three-letter code; defaults to `CLP`  |
| `expense_date`           | text    | Required valid `YYYY-MM-DD` date                         |
| `paid_by_participant_id` | text    | Required foreign key to active participant               |
| `receipt_object_key`     | text    | Nullable private R2 key; never client supplied           |
| `receipt_filename`       | text    | Nullable sanitized original name; at most 255 characters |
| `receipt_content_type`   | text    | Nullable supported MIME type                             |
| `receipt_size_bytes`     | integer | Nullable; 1 through 10,485,760 when receipt exists       |
| `created_by_user_id`     | text    | Required foreign key to application user                 |
| `created_at`             | text    | Required UTC timestamp                                   |
| `updated_at`             | text    | Required UTC timestamp                                   |
| `deleted_at`             | text    | Nullable UTC timestamp                                   |

Receipt metadata fields are either all null or all present. Soft-deleted rows remain referentially
intact and are excluded from all normal queries and summaries.

## Expense Share

Represents one participant's exact portion and reimbursement state for one expense.

| Field                    | Type    | Rules                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `id`                     | text    | Primary key                                                           |
| `expense_id`             | text    | Required foreign key to expense; cascade only at DB maintenance level |
| `participant_id`         | text    | Required foreign key; unique with expense                             |
| `share_amount_minor`     | integer | Required; non-negative                                                |
| `status`                 | text    | `settled`, `pending`, or `paid`                                       |
| `paid_to_participant_id` | text    | Null for payer; expense payer for non-payers                          |
| `paid_at`                | text    | Required only for `paid`; null otherwise                              |
| `marked_by_user_id`      | text    | Required only for `paid`; null otherwise                              |
| `created_at`             | text    | Required UTC timestamp                                                |
| `updated_at`             | text    | Required UTC timestamp                                                |

### State transitions

```text
Payer:      settled (terminal)
Non-payer:  pending ↔ paid
```

- Creation sets exactly one payer share to `settled` and two non-payer shares to `pending`.
- `pending → paid` sets `paid_at`, `marked_by_user_id`, and `updated_at` together.
- `paid → pending` clears `paid_at` and `marked_by_user_id` and updates `updated_at`.
- Amount or payer recalculation replaces all three shares only after required confirmation.

## Exact split algorithm

Given positive integer `amount` and participants sorted ascending:

1. `base = floor(amount / participantCount)`
2. `remainder = amount % participantCount`
3. Participant at zero-based position `i` receives `base + (i < remainder ? 1 : 0)`
4. The three outputs are non-negative and sum exactly to `amount`

## Derived dashboard model

- `total_expenses`: count of non-deleted expenses.
- `total_amount_minor`: sum of their `amount_minor`.
- `total_paid`: sum expense amounts grouped by payer.
- `total_share`: sum all shares joined to non-deleted expenses grouped by participant.
- `net_balance`: pending incoming reimbursements minus pending outgoing reimbursements per
  participant. Positive values are still owed to the participant, negative values are still owed
  by the participant, and completed reimbursements no longer contribute to either side.
- `pending_total`: sum pending non-payer shares.
- `pending_matrix`: sum pending shares grouped by debtor participant and payer participant.

## Indexes

- Expenses: `(deleted_at, expense_date DESC, created_at DESC)`, payer, lowercase name.
- Shares: expense, participant, status, payment recipient.
- Login attempts: `locked_until`, `updated_at` for cleanup.

Foreign keys are enabled in migrations. All application queries use bound prepared statements.
