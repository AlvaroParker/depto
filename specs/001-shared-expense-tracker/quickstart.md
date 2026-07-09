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

Generate a random Auth.js secret and place it in `.dev.vars`:

```bash
pnpm auth:secret
```

## Initialize local bindings

Apply the schema and participant migrations to the local D1 simulation:

```bash
pnpm db:migrate:local
```

Seed the three login users without writing passwords to disk:

```bash
SEED_PASSWORD_ALVARO='choose-a-password' \
SEED_PASSWORD_CAMILA='choose-a-password' \
SEED_PASSWORD_TRINIDAD='choose-a-password' \
pnpm db:seed:local
```

## Develop

```bash
pnpm dev
```

Open `http://localhost:3000` and sign in as `alvaro`, `camila`, or `trinidad` using the passwords
provided to the seed command. OpenNext exposes the local D1 and R2 bindings in the Next.js server.

## Reset local data

Local binding state is disposable:

```bash
pnpm db:reset:local
```

This removes `.wrangler/state`, reapplies migrations, and requires running the user seed again.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
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

Seed production users from a trusted workstation by rerunning the seed command with `--remote` and
strong unique passwords. Never commit `.dev.vars`, seed password variables, uploaded receipts, or
the local `.wrangler` directory.
