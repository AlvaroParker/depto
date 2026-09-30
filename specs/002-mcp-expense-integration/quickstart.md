# Quickstart: OAuth-Authenticated Expense MCP

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.dev.vars.example` to `.dev.vars`, set a stable HTTPS `APP_BASE_URL` for connector testing, and configure Auth.js as before.
3. Apply D1 migrations with `pnpm db:migrate:local`.
4. Start the application with `pnpm dev` or the Workers preview flow.

## OAuth smoke flow

1. `POST /oauth/register` with a client name and exact callback URI.
2. Open `/oauth/authorize` with the returned client ID, `response_type=code`, `state`, `scope=expenses:read expenses:write reimbursements:write offline_access`, the application-origin `resource`, and an S256 challenge.
3. Sign in as a regular participant-linked user and approve the Spanish consent screen.
4. Exchange the returned code at `/oauth/token` using the verifier, exact callback, and exact resource.
5. Call `/api/dashboard` with `Authorization: Bearer ...`.
6. Rotate the refresh token once and confirm the predecessor is rejected and family reuse revokes the successor.
7. Open settings, inspect “Aplicaciones conectadas”, disconnect the client, and confirm the access token is rejected.

## MCP smoke flow

1. Configure MCP Inspector with the public `/mcp` URL.
2. Complete OAuth discovery and consent.
3. Initialize and confirm exactly sixteen tools are listed, with per-tool OAuth scopes, concrete file descriptors and typed success/error output schemas.
4. Call reference data, balance, expense list, and expense detail.
5. Create an expense with a unique idempotency key; repeat it and confirm the same expense is returned.
6. Exercise paid/pending, proof, and open-share tools as the connected participant.
7. Confirm GET and DELETE `/mcp` return 405 and unauthenticated POST includes `resource_metadata` in `WWW-Authenticate`.

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
