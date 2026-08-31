import "server-only";

import { findExpenseIdempotencyRecord } from "@/lib/db/expense-idempotency";
import { findExpenseById } from "@/lib/db/expenses";
import {
	findTelegramExpenseActorByTelegramUserId,
	type TelegramExpenseActor,
} from "@/lib/db/telegram";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import {
	createIdempotentExpenseForActor,
	type ExpenseServiceDependencies,
} from "@/lib/services/expenses";
import { attachReceiptStreamIfMissing } from "@/lib/services/files";
import { ExpenseCreateInputSchema, type ExpenseDetail } from "@/lib/types/expense";
import {
	AttachTelegramExpenseReceiptRequestSchema,
	type AttachTelegramExpenseReceiptResult,
	CreateTelegramExpenseRequestSchema,
	type CreateTelegramExpenseResult,
	FindTelegramExpenseRequestSchema,
	type FindTelegramExpenseResult,
	TELEGRAM_EXPENSE_IDEMPOTENCY_TOOL,
	TELEGRAM_EXPENSE_RPC_VERSION,
	type TelegramExpenseSummary,
} from "./expense-contract";

export interface TelegramExpenseServiceDependencies {
	appBaseUrl: string;
	database: D1Database;
	resendApiKey?: string;
	resendFromEmail: string;
	receipts: R2Bucket;
	fetcher?: typeof fetch;
}

type ActorResolution =
	{ actor: TelegramExpenseActor; kind: "found" } | { kind: "storage_error" | "unauthorized" };

type ExpenseResolution =
	| { expense: ExpenseDetail; kind: "found" }
	| { kind: "in_progress" | "not_found" | "storage_error" };

function idempotencyKey(updateId: number): string {
	return `telegram-update/${updateId}`;
}

async function cancelReceiptStream(stream: unknown): Promise<void> {
	if (!stream || typeof (stream as ReadableStream).cancel !== "function") return;
	try {
		await (stream as ReadableStream).cancel();
	} catch {
		// Releasing an unused RPC stream is best effort and must not hide the domain result.
	}
}

function mapExpense(expense: ExpenseDetail): TelegramExpenseSummary {
	if (expense.currency !== "CLP") throw new Error("Telegram expenses must use CLP.");
	if (expense.splitMode === "open") throw new Error("Telegram expenses cannot use open splits.");
	return {
		amountMinor: expense.amountMinor,
		currency: "CLP",
		description: expense.description,
		expenseDate: expense.expenseDate,
		hasReceipt: expense.hasReceipt,
		id: expense.id,
		kind: { id: expense.kind.id, name: expense.kind.name },
		name: expense.name,
		payer: { id: expense.payer.id, name: expense.payer.name },
		shares: expense.shares.map((share) => ({
			participant: { id: share.participant.id, name: share.participant.name },
			shareAmountMinor: share.shareAmountMinor,
			status: share.status,
		})),
		splitMode: expense.splitMode,
	};
}

async function resolveActor(
	telegramUserId: string,
	database: D1Database,
): Promise<ActorResolution> {
	const actor = await findTelegramExpenseActorByTelegramUserId(telegramUserId, database);
	if (actor.err) return { kind: "storage_error" };
	return actor.val ? { actor: actor.val, kind: "found" } : { kind: "unauthorized" };
}

async function resolveExpense(
	actor: TelegramExpenseActor,
	updateId: number,
	database: D1Database,
): Promise<ExpenseResolution> {
	const record = await findExpenseIdempotencyRecord(
		{
			idempotencyKey: idempotencyKey(updateId),
			toolName: TELEGRAM_EXPENSE_IDEMPOTENCY_TOOL,
			userId: actor.userId,
		},
		database,
	);
	if (record.err) return { kind: "storage_error" };
	if (!record.val) return { kind: "not_found" };
	if (!record.val.expenseId) return { kind: "in_progress" };
	const expense = await findExpenseById(record.val.expenseId, database);
	if (expense.err || !expense.val) return { kind: "storage_error" };
	return { expense: expense.val, kind: "found" };
}

function expenseDependencies(
	dependencies: TelegramExpenseServiceDependencies,
): ExpenseServiceDependencies {
	return {
		database: dependencies.database,
		email: {
			apiKey: dependencies.resendApiKey,
			appBaseUrl: dependencies.appBaseUrl || "https://depto.parker.ci",
			fetcher: dependencies.fetcher,
			from: dependencies.resendFromEmail || "La cuenta <info@depto.parker.ci>",
		},
	};
}

export async function findTelegramExpense(
	request: unknown,
	dependencies: TelegramExpenseServiceDependencies,
): Promise<FindTelegramExpenseResult> {
	const parsed = FindTelegramExpenseRequestSchema.safeParse(request);
	if (!parsed.success) return { kind: "invalid_request", version: TELEGRAM_EXPENSE_RPC_VERSION };
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return { kind: actor.kind, version: TELEGRAM_EXPENSE_RPC_VERSION };
	const resolved = await resolveExpense(actor.actor, parsed.data.updateId, dependencies.database);
	if (resolved.kind !== "found") {
		return { kind: resolved.kind, version: TELEGRAM_EXPENSE_RPC_VERSION };
	}
	try {
		return {
			expense: mapExpense(resolved.expense),
			kind: "found",
			version: TELEGRAM_EXPENSE_RPC_VERSION,
		};
	} catch {
		return { kind: "storage_error", version: TELEGRAM_EXPENSE_RPC_VERSION };
	}
}

export async function createTelegramExpense(
	request: unknown,
	receiptStream: unknown,
	dependencies: TelegramExpenseServiceDependencies,
): Promise<CreateTelegramExpenseResult> {
	let receiptHandled = false;
	try {
		const parsed = CreateTelegramExpenseRequestSchema.safeParse(request);
		if (!parsed.success) return { kind: "invalid_request", version: TELEGRAM_EXPENSE_RPC_VERSION };
		const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
		if (actor.kind !== "found") return { kind: actor.kind, version: TELEGRAM_EXPENSE_RPC_VERSION };
		const expenseInput = ExpenseCreateInputSchema.safeParse({
			...parsed.data.expense,
			currency: "CLP",
			initialPaidParticipantIds: [],
			sendEmailNotifications: true,
			shareAllocations:
				parsed.data.expense.shareAllocations.length > 0
					? parsed.data.expense.shareAllocations
					: undefined,
		});
		if (!expenseInput.success) {
			return { kind: "invalid_request", version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
		const requestHash = await sha256Base64Url(JSON.stringify(expenseInput.data));
		const created = await createIdempotentExpenseForActor(
			expenseInput.data,
			actor.actor,
			{
				idempotencyKey: idempotencyKey(parsed.data.updateId),
				requestHash,
				toolName: TELEGRAM_EXPENSE_IDEMPOTENCY_TOOL,
				userId: actor.actor.userId,
			},
			expenseDependencies(dependencies),
		);
		if (created.kind === "conflict") {
			return { kind: "idempotency_conflict", version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
		if (
			created.kind === "in_progress" ||
			created.kind === "invalid_kind" ||
			created.kind === "storage_error"
		) {
			return {
				kind: created.kind === "invalid_kind" ? "invalid_request" : created.kind,
				version: TELEGRAM_EXPENSE_RPC_VERSION,
			};
		}

		let receipt: "already_attached" | "attached" | "failed" = "failed";
		try {
			const attachment = await attachReceiptStreamIfMissing(
				created.expense.id,
				parsed.data.receipt,
				receiptStream,
				{ database: dependencies.database, receipts: dependencies.receipts },
			);
			receiptHandled = true;
			if (attachment.kind === "attached" || attachment.kind === "already_attached") {
				receipt = attachment.kind;
			}
		} catch {
			receipt = "failed";
		}
		const current = await findExpenseById(created.expense.id, dependencies.database);
		const expense = current.ok && current.val ? current.val : created.expense;
		try {
			return {
				expense: mapExpense(expense),
				kind: created.kind,
				notification: created.kind === "created" ? created.notification : "not_sent",
				receipt,
				version: TELEGRAM_EXPENSE_RPC_VERSION,
			};
		} catch {
			return { kind: "storage_error", version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
	} finally {
		if (!receiptHandled) await cancelReceiptStream(receiptStream);
	}
}

export async function attachTelegramExpenseReceipt(
	request: unknown,
	receiptStream: unknown,
	dependencies: TelegramExpenseServiceDependencies,
): Promise<AttachTelegramExpenseReceiptResult> {
	let receiptHandled = false;
	try {
		const parsed = AttachTelegramExpenseReceiptRequestSchema.safeParse(request);
		if (!parsed.success) return { kind: "invalid_request", version: TELEGRAM_EXPENSE_RPC_VERSION };
		const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
		if (actor.kind !== "found") return { kind: actor.kind, version: TELEGRAM_EXPENSE_RPC_VERSION };
		const resolved = await resolveExpense(actor.actor, parsed.data.updateId, dependencies.database);
		if (resolved.kind !== "found") {
			return { kind: resolved.kind, version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
		let attachment: "already_attached" | "attached" | "failed" | "not_found";
		try {
			attachment = (
				await attachReceiptStreamIfMissing(
					resolved.expense.id,
					parsed.data.receipt,
					receiptStream,
					{
						database: dependencies.database,
						receipts: dependencies.receipts,
					},
				)
			).kind;
			receiptHandled = true;
		} catch {
			attachment = "failed";
		}
		if (attachment !== "attached" && attachment !== "already_attached") {
			return {
				kind: "storage_error",
				version: TELEGRAM_EXPENSE_RPC_VERSION,
			};
		}
		const current = await findExpenseById(resolved.expense.id, dependencies.database);
		if (current.err || !current.val) {
			return { kind: "storage_error", version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
		try {
			return {
				expense: mapExpense(current.val),
				kind: attachment,
				version: TELEGRAM_EXPENSE_RPC_VERSION,
			};
		} catch {
			return { kind: "storage_error", version: TELEGRAM_EXPENSE_RPC_VERSION };
		}
	} finally {
		if (!receiptHandled) await cancelReceiptStream(receiptStream);
	}
}
