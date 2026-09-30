# Plan: MCP spending insights

Use the existing Next.js, MCP SDK v1, Zod, D1, and Vitest/Miniflare stack described
in `../002-mcp-expense-integration/plan.md`.

## Design

- Put date-range and output contracts in `src/lib/types/spending-insights.ts`.
- Keep calendar arithmetic, checked integer sums, and percentage calculations in
  `src/lib/util/spending-insights.ts` so they can be verified without bindings.
- Add a server-only `src/lib/db/spending-insights.ts` repository. Aggregate in SQL
  before returning data. Use a D1 batch for comparisons and a single aggregate
  query each for trends and personal reports. Share existing expense/share tables;
  personal joins must not multiply upfront amounts by the number of recipients.
- Register three tools through the existing MCP helper and scope gate. Expose
  totals and evidence filters rather than returning unbounded expense lists.
- Update the MCP contract and quickstart, preserving historical verification notes.

## Constitution check

- Requirements and scenarios are documented before implementation.
- Monetary aggregates remain checked integer CLP; percentages are display values.
- All calls retain OAuth authentication and scopes; personal identity is server-bound.
- No extra services, migrations, dependencies, or UI changes are introduced.
- Spanish tool descriptions and unit, D1, SDK, build, and preview checks are required.

## Validation

Cover increases/decreases, new/disappearing categories, empty ranges, zero
baselines, inclusive boundaries, leap years/year transitions, clipped months,
category/payer filtering, all split modes, external payers, paid/pending states,
deleted expenses, inactive historical participants, overflow, and actor isolation.
Run repository format, lint, types, unit/integration/browser tests, both production
builds, and a local Workers preview with SDK calls for the new tools. Live connector
acceptance remains a deployment check and is not claimed from local verification.

## Delivery

1. Implement contracts, read models, and focused unit/D1 tests; commit together.
2. Expose MCP tools, update contracts, add SDK tests, and run full verification;
   commit together and publish a PR against `main`.
