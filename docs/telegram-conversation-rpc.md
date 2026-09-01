# Telegram conversational ledger RPC

`TelegramExpenses` exposes additive Worker RPC methods used by the private Telegram bot. They are
not public HTTP or MCP endpoints. Every request uses a strict version-1 schema and resolves the
canonical Telegram user ID against an enabled regular account with an active participant.

## Debt breakdown

`getTelegramDebtBreakdown` accepts:

```ts
{
	version: 1;
	telegramUserId: string;
	counterpartyId: string;
	direction: "due_to_caller" | "owed_by_caller";
	page: number;
	pageSize: number; // 1-10
}
```

`due_to_caller` selects pending shares where the counterparty owes the caller.
`owed_by_caller` selects pending shares where the caller owes the counterparty. The directions are
reported independently and are never netted. Deleted expenses, non-pending shares, zero-value
shares, and shares outside that exact pair are excluded.

The successful read envelope contains `currency: "CLP"`, the counterparty, direction, exact
`totalAmountMinor`, `totalExpenseCount`, `page`, `pageSize`, `hasMore`, and the requested expense
slice. Each expense contains only `id`, `name`, `expenseDate`, and `shareAmountMinor`. The aggregate
covers every matching expense, regardless of the requested page.

## Privacy notice state

`getTelegramPrivacyNoticeState({ version: 1, telegramUserId })` returns the current policy version,
the account's acknowledged version, and whether the current notice is required.

`acknowledgeTelegramPrivacyNotice({ version: 1, telegramUserId, noticeVersion: 1 })` advances the
stored version monotonically. Repeating it is safe, and an older acknowledgement can never lower a
newer stored value. The bot must call it only after Telegram accepts the message containing the
notice; delivery retries can then repeat the acknowledgement safely.

Both methods use the existing read result envelope and return `invalid_request`, `unauthorized`, or
`storage_error` without exposing account or database details.

## Deployment order

1. Apply D1 migration `0014_add_telegram_privacy_notice_version.sql`.
2. Deploy `depto` with the additive RPC methods.
3. Deploy `depto-tg` with the conversational tool loop.

The existing `TelegramExpenses` methods and response shapes do not change, and the Cloudflare
service binding does not need to be regenerated or reconfigured.
