# MCP Streamable HTTP and Tool Contract

## Endpoint

`POST /mcp` accepts Streamable HTTP JSON-RPC. The server is stateless and JSON-response-only. Each request constructs, connects, handles, and closes its own server/transport. `GET /mcp` and `DELETE /mcp` return `405` with `Allow: POST`. Unauthenticated POST returns the OAuth bearer challenge.

`Host` must equal the configured application host. A supplied `Origin` must equal the configured origin; an omitted Origin is allowed.

## Common result

Every success returns concise Spanish `content` and typed `structuredContent`. Expected validation, authorization, conflict, and financial-rule failures are tool results with `isError: true`, not uncaught protocol errors. Private object keys, credentials, authorization headers, and temporary URLs are absent.

## Tools

### `get_expense_reference_data`

- Scope: `expenses:read`
- Annotation: read-only, non-destructive, idempotent
- Input: `{}`
- Output: active participants, categories, currencies, split modes, file type/size limits, and caller participant.

### `get_my_balance`

- Scope: `expenses:read`
- Annotation: read-only, non-destructive, idempotent
- Input: `{}`
- Output: personal dashboard totals and per-participant debts.

### `list_expenses`

- Scope: `expenses:read`
- Annotation: read-only, non-destructive, idempotent
- Input: `q?`, `kind?`, `payer?`, `pending?: all|true|false|mine`, `page?`, `pageSize?`
- Output: current ordering, filtering, and pagination result.

### `get_expense`

- Scope: `expenses:read`
- Annotation: read-only, non-destructive, idempotent
- Input: `expenseId`
- Output: complete expense, shares, reimbursement state, receipt metadata, and proof metadata.

### `create_expense`

- Scope: `expenses:write`
- Annotation: not read-only, non-destructive, idempotent
- Input: every existing creation field; `participantIds` as share recipients; equal/custom/open split inputs; explicit allocations; initially paid participants; optional `sendEmailNotifications` (defaults to `true`); optional `receipt`; required `idempotencyKey`. An active payer may be outside equal/custom recipients; open requires a payer share.
- Output: created/original expense, `replayed`, notification status, and optional receipt warning.
- File metadata: `_meta["openai/fileParams"]` declares `receipt` fields `download_url`, `file_id`, optional `mime_type`, and `filename`.

### `set_my_payment_status`

- Scope: `reimbursements:write`
- Annotation: not read-only, potentially destructive when reverting, idempotent
- Input: `expenseId`, `status: paid|pending`
- Output: resolved caller share and updated state. Pending removes an existing proof.

### `mark_my_payment_paid_with_proof`

- Scope: `reimbursements:write`
- Annotation: not read-only, replaces prior proof, idempotent for resulting state
- Input: `expenseId`, `proof`
- Output: resolved share, paid state, and safe proof metadata.
- File metadata: `_meta["openai/fileParams"]` declares the proof descriptor fields.

### `update_my_open_share_amount`

- Scope: `reimbursements:write`
- Annotation: not read-only, non-destructive, idempotent
- Input: `expenseId`, non-negative integer `amountMinor`
- Output: updated caller pending share and recalculated payer remainder.

## File union

Generic clients may send `{ "base64": "...", "mimeType": "...", "filename": "..." }`. ChatGPT descriptors use `{ "download_url": "https://...", "file_id": "...", "mime_type": "...", "file_name": "..." }`; `filename` is accepted as a compatibility alias. Receipts allow JPEG/PNG/WebP/PDF; proofs allow JPEG/PNG/WebP; decoded/downloaded size is at most 10,485,760 bytes.
