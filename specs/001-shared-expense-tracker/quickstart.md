# Quickstart: Shared Expense Tracker

## Prerequisites

- Node.js 20 or later
- pnpm 11.11 or compatible
- A Cloudflare account only for remote resource creation and deployment

Docker is not required. Wrangler and Miniflare provide local D1 and R2 resources and persist their
state in `.wrangler/state`.

## Install

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

Generate a random Auth.js secret and place it in `.env` or `.dev.vars`:

```bash
pnpm auth:secret
```

## Initialize local bindings

Apply the schema migrations to the local D1 simulation:

```bash
pnpm db:migrate:local
```

Start development and open `http://localhost:3000`:

```bash
pnpm dev
```

The first request redirects to `/setup`. Create the single root account there; it signs in
automatically. Root can then create admins and regular users under `/settings/users`. Creating a
regular user atomically creates the corresponding expense participant; admins and root do not get
participant identities. Regular users require a unique email for expense notifications.

## Reset local data

Local binding state is disposable:

```bash
pnpm db:reset:local
```

This removes `.wrangler/state`, reapplies migrations, and returns the app to first-run setup.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:bootstrap
pnpm build
pnpm cf:build
pnpm preview
```

`pnpm preview` builds through OpenNext and runs on the local Workers runtime. Use it for the final
binding and runtime smoke test; use `pnpm dev` for normal iteration.

## Remote setup and deployment

Create production resources once, copy the generated D1 database identifier into `wrangler.jsonc`,
and keep the configured bucket private:

```bash
pnpm wrangler d1 create expenses-db
pnpm wrangler r2 bucket create expenses-receipts
pnpm db:migrate:remote
pnpm wrangler secret put AUTH_SECRET
pnpm wrangler secret put RESEND_API_KEY
pnpm deploy
```

Before deployment, verify `depto.parker.ci` as a sending domain in Resend. Wrangler provides
`APP_BASE_URL=https://depto.parker.ci` and `La cuenta <info@depto.parker.ci>` as non-secret
configuration; keep only the Resend API key in the secret store. Local development may leave
`RESEND_API_KEY` empty to skip delivery.

Open the deployed application immediately and complete `/setup` to create root. The endpoint closes
after that account exists. Create all remaining admins and users from the authenticated management
screen. Never commit `.env`, `.dev.vars`, uploaded receipts, or the local
`.wrangler` directory.

## Payment-proof smoke test

1. Sign in as a regular user and create or open an expense where that participant owes a share.
2. Select **Marcar pagado**, optionally choose a JPG, PNG, or WebP up to 10 MB, and submit.
3. Reload the expense and open the protected proof link as another authenticated household user.
4. Sign out and confirm the same `/api/expense-shares/{shareId}/proof` URL returns `401`.
5. Sign back in as the share owner, revert it to pending, and confirm the proof link disappears.

Root and admin can perform the same mutations for any non-payer share. Other regular users can view
current proof but cannot change another participant's status or attachment.

## Bulk-payment smoke test

1. Sign in as a participant who owes the same person through at least two pending expenses.
2. In **Deudas por persona**, select **Pagar todo** for that person and verify the dialog shows the
   exact expense count and total. If debt also exists in reverse, verify it is explicitly excluded.
3. Optionally choose one JPG, PNG, or WebP up to 10 MB, confirm, and verify the outgoing debt clears.
4. Open every affected expense and verify it is paid and exposes the same uploaded proof.
5. Revert one share to pending and confirm the remaining paid expenses can still open their proof.

## Email-notification smoke test

1. Give two regular users distinct inboxes in **Ajustes → Administrar usuarios**.
2. Create an expense that selects both participants.
3. Confirm each inbox receives an individual message from `info@depto.parker.ci` containing that
   participant's exact share and a working authenticated expense-detail link.
4. Create an expense without selecting one of those participants and confirm that inbox is not addressed.

## Split-mode smoke test

1. Create a **Montos específicos** expense and confirm the form rejects allocations until they sum
   exactly to the total.
2. Create a **Cuenta abierta**, adjust one non-payer amount, and confirm the payer row immediately
   shows the remaining amount.
3. Sign in as that non-payer, change the pending amount from the detail page, and confirm both rows
   update while their total remains exact.
4. Mark the share paid and confirm its amount stays locked until the reimbursement is reverted.
