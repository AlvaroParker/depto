# Quickstart: OAuth-Authenticated Expense MCP

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.dev.vars.example` to `.dev.vars`, set a stable HTTPS `APP_BASE_URL` for connector testing, and configure Auth.js as before.
3. Apply D1 migrations with `pnpm db:migrate:local`.
4. Start the application with `pnpm dev` or the Workers preview flow.

## OAuth smoke flow

1. `POST /oauth/register` with a client name, exact callback URI, `grant_types=["authorization_code", "refresh_token"]`, and `scope="expenses:read expenses:write reimbursements:write offline_access"`.
2. Open `/oauth/authorize` with the returned client ID, `response_type=code`, `state`, `scope=expenses:read expenses:write reimbursements:write offline_access`, the application-origin `resource`, and an S256 challenge.
3. Sign in as a regular participant-linked user and approve the Spanish consent screen.
4. Exchange the returned code at `/oauth/token` using the verifier, exact callback, and exact resource.
5. Call `/api/dashboard` with `Authorization: Bearer ...`.
6. Rotate the refresh token once and confirm the predecessor is rejected and family reuse revokes the successor.
7. Open settings, inspect “Aplicaciones conectadas”, disconnect the client, and confirm the access token is rejected.

## MCP smoke flow

1. Configure MCP Inspector with the public `/mcp` URL.
2. Complete OAuth discovery and consent.
3. Initialize and confirm exactly nineteen tools are listed, with per-tool OAuth scopes, concrete file descriptors and typed success/error output schemas.
4. Call reference data, balance, expense list, and expense detail.
5. Create an expense with a unique idempotency key; repeat it and confirm the same expense is returned.
6. Exercise paid/pending, proof, and open-share tools as the connected participant.
7. Edit an expense, retry a failed receipt attachment with the original key, read its private file, and remove the receipt. Verify that deletion removes the expense from active balances.
8. Compare debt details and date-range reports with the web UI. Confirm a bulk payment changes only the caller's pending shares toward the selected person.
9. Confirm GET and DELETE `/mcp` return 405 and unauthenticated POST includes `resource_metadata` in `WWW-Authenticate`.
10. Call `get_expense_comparison` for two explicit periods and verify peso/percentage changes. Call `get_expense_trends` across an empty month and verify the zero bucket. Call `get_my_spending_report` as two different users and confirm each receives their own shares and payments. Use read-only credentials for all three.

## Quality gates

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm cf:build
```

Finally run MCP Inspector, ChatGPT developer mode, and a Claude custom connector against an HTTPS Workers preview.

## Reliability verification — 2026-09-30

The audit follow-up passed formatting, lint, TypeScript, 207 unit tests, 136 Miniflare integration tests, 68 desktop/mobile browser tests, and the isolated first-install browser test. Next.js and OpenNext Cloudflare production builds passed. The full browser run also exposed a category summary overflow at 200px; allowing that header to wrap resolved it.

A local OpenNext Workers preview passed discovery, unauthenticated challenges, unsupported-method responses, dynamic client registration, PKCE code exchange, SDK initialization and all sixteen tool definitions, a reference-data read, an insufficient-scope tool challenge, refresh rotation, reuse-triggered family revocation, and scheduled maintenance. The preview used local D1/R2 fixtures and no production credentials.

Live ChatGPT/MCP Inspector/Claude acceptance remains a deployment check (T055). Apply migrations `0015` and `0016` before deploying, refresh the connector's tool schemas, and verify automatic access renewal and real ChatGPT attachments. Local SDK and Workers checks do not establish that the deployed ChatGPT reconnect issue is resolved.
