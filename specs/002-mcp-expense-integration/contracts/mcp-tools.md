# MCP Streamable HTTP and Tool Contract

## Endpoint

`POST /mcp` accepts Streamable HTTP JSON-RPC. The server is stateless and JSON-response-only. Each request constructs, connects, handles, and closes its own server/transport. `GET /mcp` and `DELETE /mcp` return `405` with `Allow: POST`. Unauthenticated POST returns the OAuth bearer challenge.

`Host` must equal the configured application host. A supplied `Origin` must equal the configured origin; an omitted Origin is allowed.

## Common result

Every success returns concise Spanish `content` and typed `structuredContent`. Expected validation, authorization, conflict, and financial-rule failures are tool results with `isError: true`, not uncaught protocol errors. Private object keys, credentials, authorization headers, and temporary URLs are absent.

Each tool publishes `securitySchemes` and its `_meta` mirror with the required OAuth scope. Missing scopes return `_meta["mcp/www_authenticate"]` with `insufficient_scope`, a description, resource metadata URL and required scope. Output schemas accept either the concrete success object or `{code, message, issues?: [{path, message}]}`; clients can validate business failures as well as success.

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
- Input: `q?`, `kind?`, `payer?`, `pending?: all|true|false|mine`, `page?`, `pageSize?`, inclusive `dateFrom?` and `dateTo?` (`YYYY-MM-DD`).
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
- File metadata: `_meta["openai/fileParams"]` declares a concrete `receipt` object with required `download_url` and `file_id`, optional `mime_type` and `file_name`. `receiptInline` supports base64 separately.
- Retrying with the same financial input and key can recover a missing receipt; it never overwrites an existing receipt or creates another expense. The expense response includes committed receipt metadata.

### `set_my_payment_status`

- Scope: `reimbursements:write`
- Annotation: not read-only, potentially destructive when reverting, idempotent
- Input: `expenseId`, `status: paid|pending`
- Output: resolved caller share and updated state. Pending removes an existing proof.

### `mark_my_payment_paid_with_proof`

- Scope: `reimbursements:write`
- Annotation: not read-only, replaces prior proof, not idempotent (each upload creates new metadata).
- Input: `expenseId`, exactly one of `proof` or `proofInline`.
- Output: resolved share, paid state, and safe proof metadata.
- File metadata: `_meta["openai/fileParams"]` declares the proof descriptor fields.

### `update_my_open_share_amount`

- Scope: `reimbursements:write`
- Annotation: not read-only, non-destructive, idempotent
- Input: `expenseId`, non-negative integer `amountMinor`
- Output: updated caller pending share and recalculated payer remainder.

## Additional tools

| Tool                     | Scope                  | Input / behavior                                                                                                                                                                                   |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update_expense`         | `expenses:write`       | `expenseId`, complete expense fields, `resetPaidReimbursements=false`. Preserves web rules: regular users cannot financially recalculate open expenses; paid resets require explicit confirmation. |
| `delete_expense`         | `expenses:write`       | `expenseId`; soft-deletes the expense and removes it from balances.                                                                                                                                |
| `attach_expense_receipt` | `expenses:write`       | `expenseId`, exactly one of `receipt`/`receiptInline`; replaces an existing receipt.                                                                                                               |
| `remove_expense_receipt` | `expenses:write`       | `expenseId`; detaches the receipt with best-effort object cleanup.                                                                                                                                 |
| `read_expense_file`      | `expenses:read`        | `expenseId`, `kind=receipt                                                                                                                                                                         | payment_proof`, `shareId` for proof; returns private image content or embedded PDF resource plus safe metadata, never public object URLs. |
| `pay_all_my_debt`        | `reimbursements:write` | `paidToParticipantId`, optional `proof`/`proofInline`; marks the caller's pending shares paid using the bulk service. Does not transfer money. Not idempotent across newly created debts.          |
| `get_my_debt_breakdown`  | `expenses:read`        | `counterpartyId`, `direction=due_to_caller                                                                                                                                                         | owed_by_caller`, page/pageSize; caller-bound debt details and totals.                                                                     |
| `get_expense_report`     | `expenses:read`        | Required inclusive `dateFrom`/`dateTo`, optional `kind`/`payer`; household spending grouped by category/payer in integer CLP.                                                                      |

Expense edits/deletions and receipt replacement/removal declare destructive behavior. File reads, debt details and reports are read-only. File replacement declares non-idempotence because each upload creates new metadata. Access follows the existing household visibility rules.

## Files

Generic clients send `{ "base64": "...", "mimeType": "...", "filename": "..." }` in the separate `receiptInline` or `proofInline` parameter. ChatGPT descriptors use `{ "download_url": "https://...", "file_id": "...", "mime_type": "...", "file_name": "..." }`; the last two fields are optional and `filename` remains an optional compatibility alias. Missing names get a safe MIME-derived name. Receipts allow JPEG/PNG/WebP/PDF; proofs allow JPEG/PNG/WebP; decoded/downloaded size is at most 10,485,760 bytes. MIME signatures are checked before storage. Downloads have a 20-second total deadline and a trusted-host allowlist, private/reserved-IP checks and at most three validated redirects. Configure additional trusted file providers with `MCP_FILE_ALLOWED_HOSTS`; the default is `oaiusercontent.com`. Client schemas must be refreshed after upgrading from the original file union.

Reference: [OpenAI file descriptors and tool metadata](https://developers.openai.com/plugins/reference), [OAuth challenges](https://developers.openai.com/plugins/build/auth).
