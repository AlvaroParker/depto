# Feature: MCP spending insights

## Scope

Extend the existing authenticated MCP with household comparisons, monthly trends,
and caller-owned personal spending reports. This implements the first release
selected in the feature discussion. Budgets, recurrence, reminders, imports,
exports, anomaly detection, and household-information tools remain out of scope.

## User scenarios

1. Ask «¿Cómo variaron los gastos comunes respecto al mes pasado?» and receive
   the two totals, signed peso and percentage changes, and category contributions.
2. Ask «¿Cómo han cambiado los gastos durante los últimos seis meses?» and receive
   chronological monthly totals, including months without recorded expenses.
3. Ask «¿Cuánto me correspondió pagar este mes?» and distinguish allocated shares,
   amounts paid upfront, completed reimbursements, and pending reimbursements.

## Requirements

- **FR-001**: Add `get_expense_comparison`, `get_expense_trends`, and
  `get_my_spending_report` as read-only tools requiring `expenses:read`, with typed
  output schemas, Spanish descriptions, and the existing OAuth error behavior.
- **FR-002**: Accept explicit inclusive calendar dates. Validate real dates,
  ordered ranges, and at most 60 calendar months per range. Echo dates, day counts,
  and whether a range covers only complete calendar months. Clients resolve
  relative dates in the user's timezone and choose full-month or month-to-date
  comparisons explicitly; the server never silently normalizes unequal periods.
- **FR-003**: Compare a `period` against a `baseline`, with optional category and
  payer filters applied to both. Return totals, counts, signed changes, and the
  union of category contributions, ordered by absolute peso change. Percentages
  are rounded to two decimals and are null whenever the baseline is zero.
  Categories and echoed filters allow drill-down with `list_expenses`.
- **FR-004**: Return one trend bucket for every calendar month touched by the
  requested range, with clipped boundary dates, partial-period metadata, totals,
  counts, and category breakdowns. Empty buckets have zero totals. Zero expenses
  means no records, not evidence that all household bills were entered.
- **FR-005**: Bind personal reports to the authenticated participant. Group by
  category and report allocated shares, expenses paid upfront, reimbursements
  paid and received, and amounts currently pending in each direction. Include
  expenses paid by the caller even when the caller receives no share. Accept an
  optional category filter. Never accept another participant's ID as report owner.
- **FR-006**: Personal periods filter by expense date. Reimbursement fields show
  the current state of those expenses, even if reimbursement happened later;
  they are not historical cash-flow reports. State this in metadata and tool copy.
- **FR-007**: Exclude soft-deleted expenses, include historical participants and
  all split modes, and preserve integer CLP totals. Reject unsafe aggregate values
  rather than return rounded monetary amounts. Comparisons read both periods in
  a single database batch. No migrations, mutations, or new OAuth scopes are needed.
- **FR-008**: Verify database aggregates against independently specified fixtures,
  calendar boundaries and invalid inputs, caller isolation, OAuth scopes, and real
  MCP SDK discovery/calls. Preserve the existing sixteen tools.
