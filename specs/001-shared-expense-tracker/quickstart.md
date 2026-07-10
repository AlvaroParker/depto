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
participant identities.

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
pnpm deploy
```

Open the deployed application immediately and complete `/setup` to create root. The endpoint closes
after that account exists. Create all remaining admins and users from the authenticated management
screen. Never commit `.env`, `.dev.vars`, uploaded receipts, or the local
`.wrangler` directory.
