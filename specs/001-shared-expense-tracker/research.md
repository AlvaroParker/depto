# Research: Shared Expense Tracker

## Native local D1 and R2 development

**Decision**: Use Wrangler/Miniflare local simulations configured by `wrangler.jsonc`; do not add
Docker Compose.

**Rationale**: Wrangler simulates both D1 and R2 with the production binding APIs and persists state
under `.wrangler/state`. OpenNext exposes those bindings during `next dev` and Workers preview. This
is less operational work and more runtime-faithful than substituting generic SQLite and S3 images.

**Alternatives considered**:

- Docker SQLite plus MinIO: rejected because adapters would diverge from D1/R2 binding behavior.
- Remote development resources: useful as an opt-in, but rejected as the default because it needs
  credentials, may mutate shared data, and is slower.

**Sources**: [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/),
[R2 Workers API local behavior](https://developers.cloudflare.com/r2/get-started/workers-api/),
[OpenNext bindings](https://opennext.js.org/cloudflare/bindings)

## Authentication session strategy

**Decision**: Auth.js v5 Credentials with signed JWT cookie sessions and application users in D1.

**Rationale**: Credentials authentication supplies custom D1 lookup and password verification.
JWT sessions avoid unrelated adapter tables and an extra database request on every page while the
small household does not need server-side session administration. Disabled state is checked during
new sign-ins; short session lifetime limits stale access.

**Alternatives considered**:

- Auth.js D1 adapter sessions: supported, but adds four tables without improving this fixed-user MVP.
- Bespoke cookies: rejected because Auth.js is explicitly required and provides established session
  and CSRF handling.

**Sources**: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials),
[Auth.js v5 migration](https://authjs.dev/getting-started/migrating-to-v5),
[Auth.js D1 adapter](https://authjs.dev/getting-started/adapters/d1)

## Password hashing

**Decision**: PBKDF2-HMAC-SHA-256 through Web Crypto with 100,000 iterations, a random 16-byte salt,
a 32-byte derived key, constant-time comparison, and encoded format
`pbkdf2-sha256$100000$<base64url-salt>$<base64url-hash>`.

**Rationale**: Web Crypto is available in both Node tooling and Cloudflare Workers. Cloudflare's
runtime rejects PBKDF2 iteration counts above 100,000, so the maximum supported work factor is
combined with login rate limiting. The self-describing format permits future rehashing if the
runtime limit changes.

**Alternatives considered**:

- Argon2id: preferred in general, but available packages rely on WebAssembly/native behavior that
  adds deployment and CPU uncertainty on Workers.
- Fast SHA-256: rejected because it is not a password hashing function.

**Source**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Login rate limiting

**Decision**: Persist two D1 attempt windows per failure: a SHA-256 key for normalized username and
another for client address. Lock either scope after five failures in fifteen minutes for fifteen
minutes; return the same generic failure for invalid, disabled, and limited attempts.

**Rationale**: A D1 model works in local simulation, supports both required dimensions, and requires
no additional production binding. Hashed keys avoid keeping attempted usernames or addresses in
the rate-limit table.

**Alternatives considered**:

- Cloudflare Rate Limiting binding: rejected for MVP because it is not locally simulated and cannot
  express the username dimension directly.
- In-memory counters: rejected because Worker isolates are ephemeral and distributed.

## D1 access and transaction boundary

**Decision**: Use direct typed prepared statements and D1 `batch()` for expense/share atomic writes.

**Rationale**: The schema is small, direct SQL keeps deployment lean, prepared statements bind all
inputs, and D1 documents that a failed batch aborts or rolls back the full transactional sequence.

**Alternatives considered**:

- ORM: rejected because its migration/runtime abstraction adds weight without meaningful value for
  five stable tables.
- Sequential standalone writes: rejected because a partial split would violate financial integrity.

**Source**: [D1 `batch()` API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

## Receipt transport and privacy

**Decision**: Stream raw request bodies through an authenticated expense receipt route to the R2
binding, then stream reads back through the same protected association. Limit objects to 10 MB and
retain them when expenses are soft-deleted.

**Rationale**: Worker binding `put()` accepts a stream, preserves HTTP metadata, and is strongly
consistent. A protected route avoids public bucket URLs and S3 credentials. Ten megabytes is well
inside Cloudflare's smallest request body limit and Worker memory when streaming.

**Alternatives considered**:

- S3 presigned URLs: rejected because they require separate API credentials and CORS configuration.
- Form-data buffering in the application: rejected in favor of a raw streaming body.
- Public R2 development URL: rejected because receipt privacy is mandatory.

**Sources**: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## UI direction

**Decision**: A warm, editorial household ledger aesthetic: paper and ink neutrals, terracotta
actions, deep green positive balances, clear tabular numerals, subtle ruled backgrounds, and compact
phone cards. Use Server Components for reads and small client islands for mutations.

**Rationale**: The visual language makes the product feel like a trusted shared notebook rather than
a generic finance dashboard, while preserving dense legibility and touch-friendly actions.

**Alternatives considered**:

- Generic blue SaaS dashboard: rejected as visually interchangeable and less domestic.
- Highly decorative maximalism: rejected because receipt capture and reimbursement updates need
  speed, contrast, and clarity on phones.

## Share-level payment proof

**Decision**: Store one current proof-image metadata row per paid expense share in D1 and the binary
under a separate opaque prefix in the existing private R2 bucket. Use a raw-body authenticated route
that can attach proof and mark pending shares paid without multipart buffering.

**Rationale**: A separate table preserves the distinction between purchase receipts and repayment
evidence, enforces one current proof, and allows share recalculation to cascade metadata cleanly.
Reusing the established streaming and compensating-cleanup pattern keeps Worker memory bounded.

**Alternatives considered**:

- Columns on `expense_shares`: rejected because a separate entity gives stronger complete-metadata
  constraints and clearer lifecycle handling.
- Multipart status plus file upload: rejected because it buffers parsing and duplicates the existing
  raw-body R2 transport.
- Multiple immutable submissions: rejected because the product requires one current proof only.
