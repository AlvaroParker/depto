# Data Model: Shared Expense Tracker

All identifiers are text UUIDs. Timestamps are UTC ISO
8601 text. Calendar expense dates use `YYYY-MM-DD`. Money is an integer in the currency's minor unit.

## Participant

Represents a regular application user who can be selected for an equal split.

| Field        | Type    | Rules                                           |
| ------------ | ------- | ----------------------------------------------- |
| `id`         | text    | Primary key                                     |
| `name`       | text    | Required; display name                          |
| `slug`       | text    | Required; unique normalized name                |
| `email`      | text    | Nullable for migration; normalized and unique   |
| `sort_order` | integer | Required; unique; controls remainder allocation |
| `active`     | integer | `0` or `1`; follows the linked user's state     |
| `created_at` | text    | Required UTC timestamp                          |
| `updated_at` | text    | Required UTC timestamp                          |

Creating a regular user atomically creates one participant. Disabling that user deactivates the
participant for future bills, while existing participant and share rows remain for history.
New regular users require an email. Existing rows remain nullable so deployment does not invent
addresses; email-less participants are skipped for notifications until an administrator updates them.

## Application User

Represents a private credentials login. Every regular user has exactly one participant identity;
root and admin accounts have none.

| Field              | Type | Rules                                                               |
| ------------------ | ---- | ------------------------------------------------------------------- |
| `id`               | text | Primary key                                                         |
| `username`         | text | Required; unique case-insensitive normalized value                  |
| `password_hash`    | text | Required; self-describing PBKDF2 value                              |
| `display_name`     | text | Required                                                            |
| `participant_id`   | text | Required and unique for `user`; null for `root`/`admin`             |
| `role`             | text | Required; exactly `root`, `admin`, or `user`                        |
| `telegram_user_id` | text | Nullable; unique canonical integer `1`–`1099511627775`; `user` only |
| `created_at`       | text | Required UTC timestamp                                              |
| `updated_at`       | text | Required UTC timestamp                                              |
| `disabled_at`      | text | Nullable UTC timestamp                                              |

Every account has one hierarchical role. Multiple simultaneous roles are intentionally unsupported:
`root` and `admin` already include user-management privileges, so role sets would add ambiguity
without granting useful capabilities. A partial unique index permits at most one `root`. Database
triggers prevent deleting, disabling, or changing the role of that root account. Other account
deletions set `disabled_at` so financial audit foreign keys remain intact.

On a fresh database, `/setup` creates root once. Root or an admin creates regular users through the
management UI; user and participant insertion is one atomic database batch. Database triggers
enforce the role/link invariant and synchronize participant name and active state.

Regular users may declare and remove their own Telegram user ID in Settings. The value is an
unverified numeric identifier rather than an `@username`; it is not added to the login session and
must never authenticate Telegram or bot actions. Disabling an account retains and reserves its ID
until the user explicitly removes it while active.

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
| `kind_id`                | text    | Required foreign key to an expense kind                  |
| `paid_by_participant_id` | text    | Required foreign key to active participant               |
| `split_mode`             | text    | `equal`, `custom`, or `open`; defaults to `equal`        |
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

## Expense Kind

Represents a globally shared household category. Expenses reference the category, so editing its
name or icon updates historical display without changing any financial data.

| Field        | Type    | Rules                                                     |
| ------------ | ------- | --------------------------------------------------------- |
| `id`         | text    | Primary key                                               |
| `name`       | text    | Required; 1–60 characters; unique case-insensitively      |
| `icon_key`   | text    | Required key from the application-owned Lucide registry   |
| `sort_order` | integer | Required; unique; seeded kinds first, custom kinds append |
| `created_at` | text    | Required UTC timestamp                                    |
| `updated_at` | text    | Required UTC timestamp                                    |

The migration seeds Arriendo, Gastos comunes, Agua, Luz, Gas, Internet, Supermercado, Comida,
Limpieza, Electrodomésticos, Muebles, Reparaciones, Transporte, Salud, Mascotas, Educación, and
Otros. Existing expenses are backfilled to Otros. Root and admin may create or edit kinds; deletion
and archival are intentionally unsupported so every historical reference remains valid.

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
| `bulk_payment_id`        | text    | Opaque operation ID for shares paid together; otherwise null          |
| `created_at`             | text    | Required UTC timestamp                                                |
| `updated_at`             | text    | Required UTC timestamp                                                |

### State transitions

```text
Payer:      settled (terminal)
Non-payer:  pending ↔ paid
```

- Creation sets exactly one payer share to `settled`, creator-checked non-payer shares to `paid`,
  and unchecked non-payer shares to `pending`. Initially paid shares use the expense creation time
  for `paid_at` and the expense creator for `marked_by_user_id`.
- `pending → paid` sets `paid_at`, `marked_by_user_id`, and `updated_at` together.
- `paid → pending` clears `paid_at` and `marked_by_user_id` and updates `updated_at`.
- Amount, payer, or participant-set recalculation replaces selected shares only after required confirmation.
- Custom shares persist creator-entered exact amounts. Open pending non-payer shares are owner/root/admin
  editable; each update atomically assigns the remaining total to the payer share.
- A zero share remains associated but is excluded from pending counts and cannot transition to paid.

## Expense Share Payment Proof

Represents the one current private deposit screenshot attached to a paid non-payer share.

| Field                 | Type    | Rules                                                        |
| --------------------- | ------- | ------------------------------------------------------------ |
| `share_id`            | text    | Primary key and foreign key to expense share; cascade delete |
| `object_key`          | text    | Required opaque R2 key; never returned publicly              |
| `filename`            | text    | Required sanitized basename; maximum 255 characters          |
| `content_type`        | text    | `image/jpeg`, `image/png`, or `image/webp`                   |
| `size_bytes`          | integer | Required; 1 through 10,485,760                               |
| `uploaded_by_user_id` | text    | Required foreign key to application user                     |
| `uploaded_at`         | text    | Required UTC timestamp                                       |

- A proof may exist only while its share is `paid`; database triggers defend this invariant.
- Upload on a pending share sets the payment audit fields and proof metadata in one D1 batch.
- Replacement preserves `paid_at` and `marked_by_user_id`, then deletes the prior R2 object.
- Reversion deletes the association before changing the share to `pending` and clearing audit data.
- Financial recalculation cascades metadata deletion and performs compensating R2 cleanup. Soft
  expense deletion retains both the share and proof for inaccessible audit history.
- Bulk payment writes one association per affected paid share while every association references the
  same newly uploaded R2 object. Individual replacement or reversion removes only that association;
  the shared object is deleted after its final database reference is removed.

## Exact split algorithm

Given positive integer `amount` and participants sorted ascending:

1. `base = floor(amount / participantCount)`
2. `remainder = amount % participantCount`
3. Participant at zero-based position `i` receives `base + (i < remainder ? 1 : 0)`
4. All outputs are non-negative and sum exactly to `amount`

Custom and open creation validate one allocation per selected participant and the same exact-sum
invariant. For an open mutation, a non-payer amount cannot exceed `expense amount - other non-payer
shares`; the payer share is recalculated from that remainder in the same D1 batch.

## Household Information Item

Represents one useful household service or reference card. Stable common attributes remain typed,
while uncommon display data is stored in ordered child rows rather than an unrestricted JSON blob.

| Field                | Type    | Rules                                                     |
| -------------------- | ------- | --------------------------------------------------------- |
| `id`                 | text    | Primary key                                               |
| `title`              | text    | Required; 1–80 characters                                 |
| `icon_key`           | text    | Required key from the application semantic icon registry  |
| `provider_name`      | text    | Nullable; 1–120 characters when present                   |
| `customer_reference` | text    | Nullable; stored as text to preserve leading zeroes       |
| `payment_url`        | text    | Nullable HTTP/HTTPS URL; at most 2,048 characters         |
| `notes`              | text    | Nullable plain text; at most 2,000 characters             |
| `sort_order`         | integer | Required and unique; new active or archived items append  |
| `created_by_user_id` | text    | Required application-user foreign key                     |
| `updated_by_user_id` | text    | Required application-user foreign key                     |
| `created_at`         | text    | Required UTC timestamp                                    |
| `updated_at`         | text    | Required UTC timestamp                                    |
| `archived_at`        | text    | Nullable UTC timestamp; excludes the item from normal use |

No rows are seeded because provider and customer information cannot be inferred. Agua, Luz, Gas,
Gastos comunes, and Otro are editor presets only, and multiple cards may use the same preset.

## Household Information Field

Represents an ordered, non-secret custom field belonging to one household information item.

| Field          | Type    | Rules                                              |
| -------------- | ------- | -------------------------------------------------- |
| `id`           | text    | Primary key                                        |
| `item_id`      | text    | Required parent foreign key; maintenance cascade   |
| `label`        | text    | Required; 1–60 characters; unique per parent       |
| `value`        | text    | Required plain text; 1–500 characters              |
| `display_type` | text    | Exactly `text` or `link`; links require HTTP/HTTPS |
| `sort_order`   | integer | Required; unique within the parent                 |

Create and update use one D1 `batch()` for the parent and complete child collection. Updates replace
the child set atomically. Files and secret values are deliberately unsupported because every card is
readable by every authenticated user.

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

- Expenses: `(deleted_at, expense_date DESC, created_at DESC)`, payer, kind, lowercase name.
- Shares: expense, participant, status, payment recipient.
- Login attempts: `locked_until`, `updated_at` for cleanup.

Foreign keys are enabled in migrations. All application queries use bound prepared statements.
