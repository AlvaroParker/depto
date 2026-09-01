import "server-only";

import {
	PAYMENT_PROOF_CONTENT_TYPES,
	MAX_PAYMENT_PROOF_SIZE_BYTES,
} from "@/lib/const/payment-proofs";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import { getDashboardSummary } from "@/lib/db/dashboard";
import { listExpenseKinds } from "@/lib/db/expense-kinds";
import { findExpenseById, listExpenses } from "@/lib/db/expenses";
import { findActiveParticipants, findParticipantById } from "@/lib/db/participants";
import {
	acknowledgeTelegramPrivacyNoticeVersionByTelegramUserId,
	findTelegramExpenseActorByTelegramUserId,
	findTelegramPrivacyNoticeVersionByTelegramUserId,
	type TelegramExpenseActor,
} from "@/lib/db/telegram";
import { findTelegramDebtBreakdown } from "@/lib/db/telegram-debts";
import type { ExpenseDetail, ExpenseQuery, ExpenseSummary } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";
import {
	AcknowledgeTelegramPrivacyNoticeRequestSchema,
	type AcknowledgeTelegramPrivacyNoticeResult,
	GetTelegramBalanceRequestSchema,
	type GetTelegramBalanceResult,
	GetTelegramDebtBreakdownRequestSchema,
	type GetTelegramDebtBreakdownResult,
	GetTelegramExpenseContextRequestSchema,
	type GetTelegramExpenseContextResult,
	GetTelegramExpenseRequestSchema,
	type GetTelegramExpenseResult,
	GetTelegramPrivacyNoticeStateRequestSchema,
	type GetTelegramPrivacyNoticeStateResult,
	ListTelegramExpensesRequestSchema,
	type ListTelegramExpensesResult,
	TELEGRAM_CONVERSATION_RPC_VERSION,
	TELEGRAM_PRIVACY_NOTICE_VERSION,
	type TelegramBalanceDto,
	type TelegramConversationExpenseDetailDto,
	type TelegramConversationExpenseSummaryDto,
	type TelegramExpenseContextDto,
	type TelegramExpenseKindDto,
	type TelegramExpensePageDto,
	type TelegramParticipantDto,
	type TelegramReadFailureKind,
	type TelegramReadResult,
} from "./conversation-contract";

export interface TelegramConversationServiceDependencies {
	database: D1Database;
}

type ActorResolution =
	{ actor: TelegramExpenseActor; kind: "found" } | { kind: "storage_error" | "unauthorized" };

function failure<T>(kind: TelegramReadFailureKind): TelegramReadResult<T> {
	return { kind, version: TELEGRAM_CONVERSATION_RPC_VERSION };
}

function success<T>(data: T): TelegramReadResult<T> {
	return { data, kind: "ok", version: TELEGRAM_CONVERSATION_RPC_VERSION };
}

function privacyNoticeState(acknowledgedVersion: number) {
	return {
		acknowledgedVersion,
		currentVersion: TELEGRAM_PRIVACY_NOTICE_VERSION,
		required: acknowledgedVersion < TELEGRAM_PRIVACY_NOTICE_VERSION,
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

function mapParticipant(participant: Participant): TelegramParticipantDto {
	return {
		id: participant.id,
		name: participant.name,
		slug: participant.slug,
		sortOrder: participant.sortOrder,
	};
}

function mapExpenseKind(kind: ExpenseKind): TelegramExpenseKindDto {
	return { id: kind.id, name: kind.name, sortOrder: kind.sortOrder };
}

function mapExpenseSummary(expense: ExpenseSummary): TelegramConversationExpenseSummaryDto {
	if (expense.currency !== "CLP") throw new Error("Telegram expenses must use CLP.");
	return {
		amountMinor: expense.amountMinor,
		currency: "CLP",
		description: expense.description,
		expenseDate: expense.expenseDate,
		hasReceipt: expense.hasReceipt,
		id: expense.id,
		kind: mapExpenseKind(expense.kind),
		name: expense.name,
		payer: mapParticipant(expense.payer),
		shares: expense.shares.map((share) => ({
			participant: mapParticipant(share.participant),
			shareAmountMinor: share.shareAmountMinor,
			status: share.status,
		})),
		splitMode: expense.splitMode,
	};
}

function mapExpenseDetail(expense: ExpenseDetail): TelegramConversationExpenseDetailDto {
	let receipt: TelegramConversationExpenseDetailDto["receipt"] = null;
	if (expense.hasReceipt) {
		if (
			!expense.receiptFilename ||
			!expense.receiptContentType ||
			expense.receiptSizeBytes === null ||
			!RECEIPT_CONTENT_TYPES.includes(
				expense.receiptContentType as (typeof RECEIPT_CONTENT_TYPES)[number],
			)
		) {
			throw new Error("Stored receipt metadata is incomplete.");
		}
		receipt = {
			contentType: expense.receiptContentType as (typeof RECEIPT_CONTENT_TYPES)[number],
			filename: expense.receiptFilename,
			sizeBytes: expense.receiptSizeBytes,
		};
	}
	return {
		...mapExpenseSummary(expense),
		createdAt: expense.createdAt,
		receipt,
		updatedAt: expense.updatedAt,
	};
}

function mapListQuery(
	query: ReturnType<typeof ListTelegramExpensesRequestSchema.parse>["query"],
): Partial<ExpenseQuery> {
	return {
		kind: query.kindId,
		page: query.page,
		pageSize: query.pageSize,
		payer: query.payerId,
		pending:
			query.pending === "all"
				? undefined
				: query.pending === "mine"
					? "mine"
					: query.pending === "true",
		q: query.q,
	};
}

export async function getTelegramExpenseContext(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<GetTelegramExpenseContextResult> {
	const parsed = GetTelegramExpenseContextRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return failure(actor.kind);
	const [participants, categories] = await Promise.all([
		findActiveParticipants(dependencies.database),
		listExpenseKinds(dependencies.database),
	]);
	if (participants.err || categories.err) return failure("storage_error");
	const callerParticipant = participants.val.find(({ id }) => id === actor.actor.participantId);
	if (!callerParticipant) return failure("storage_error");
	const data: TelegramExpenseContextDto = {
		caller: {
			displayName: actor.actor.displayName,
			participant: mapParticipant(callerParticipant),
		},
		categories: categories.val.map(mapExpenseKind),
		currencies: ["CLP"],
		fileLimits: {
			paymentProofs: {
				contentTypes: [...PAYMENT_PROOF_CONTENT_TYPES],
				maxBytes: MAX_PAYMENT_PROOF_SIZE_BYTES,
			},
			receipts: {
				contentTypes: [...RECEIPT_CONTENT_TYPES],
				maxBytes: MAX_RECEIPT_SIZE_BYTES,
			},
		},
		participants: participants.val.map(mapParticipant),
		splitModes: ["equal", "custom"],
	};
	return success(data);
}

export async function getTelegramBalance(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<GetTelegramBalanceResult> {
	const parsed = GetTelegramBalanceRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return failure(actor.kind);
	const summary = await getDashboardSummary({
		currentParticipantId: actor.actor.participantId,
		database: dependencies.database,
	});
	if (summary.err || summary.val.view !== "personal") return failure("storage_error");
	try {
		const data: TelegramBalanceDto = {
			amountDueToMeMinor: summary.val.amountDueToMeMinor,
			amountOwedMinor: summary.val.amountOwedMinor,
			currency: "CLP",
			debtsByParticipant: summary.val.debtsByParticipant.map((debt) => ({
				amountDueToMeExpenseCount: debt.amountDueToMeExpenseCount,
				amountDueToMeMinor: debt.amountDueToMeMinor,
				amountOwedExpenseCount: debt.amountOwedExpenseCount,
				amountOwedMinor: debt.amountOwedMinor,
				participant: mapParticipant(debt.participant),
			})),
			dueToMeExpenseCount: summary.val.dueToMeExpenseCount,
			expectedSpendMinor: summary.val.expectedSpendMinor,
			owedExpenseCount: summary.val.owedExpenseCount,
			participantId: summary.val.participantId,
			recentExpenses: summary.val.recentExpenses.map(mapExpenseSummary),
			spentSoFarMinor: summary.val.spentSoFarMinor,
		};
		return success(data);
	} catch {
		return failure("storage_error");
	}
}

export async function getTelegramDebtBreakdown(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<GetTelegramDebtBreakdownResult> {
	const parsed = GetTelegramDebtBreakdownRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const offset = (parsed.data.page - 1) * parsed.data.pageSize;
	if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + parsed.data.pageSize)) {
		return failure("invalid_request");
	}
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return failure(actor.kind);
	if (actor.actor.participantId === parsed.data.counterpartyId) {
		return failure("invalid_request");
	}
	const counterparty = await findParticipantById(parsed.data.counterpartyId, dependencies.database);
	if (counterparty.err) return failure("storage_error");
	if (!counterparty.val) return failure("not_found");
	const breakdown = await findTelegramDebtBreakdown(
		{
			callerParticipantId: actor.actor.participantId,
			counterpartyId: counterparty.val.id,
			direction: parsed.data.direction,
			page: parsed.data.page,
			pageSize: parsed.data.pageSize,
		},
		dependencies.database,
	);
	if (breakdown.err) return failure("storage_error");
	return success({
		counterparty: mapParticipant(counterparty.val),
		currency: "CLP",
		direction: parsed.data.direction,
		expenses: breakdown.val.expenses,
		hasMore: offset + breakdown.val.expenses.length < breakdown.val.totalExpenseCount,
		page: parsed.data.page,
		pageSize: parsed.data.pageSize,
		totalAmountMinor: breakdown.val.totalAmountMinor,
		totalExpenseCount: breakdown.val.totalExpenseCount,
	});
}

export async function getTelegramPrivacyNoticeState(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<GetTelegramPrivacyNoticeStateResult> {
	const parsed = GetTelegramPrivacyNoticeStateRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const acknowledgedVersion = await findTelegramPrivacyNoticeVersionByTelegramUserId(
		parsed.data.telegramUserId,
		dependencies.database,
	);
	if (acknowledgedVersion.err) return failure("storage_error");
	if (acknowledgedVersion.val === null) return failure("unauthorized");
	return success(privacyNoticeState(acknowledgedVersion.val));
}

export async function acknowledgeTelegramPrivacyNotice(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<AcknowledgeTelegramPrivacyNoticeResult> {
	const parsed = AcknowledgeTelegramPrivacyNoticeRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const acknowledgedVersion = await acknowledgeTelegramPrivacyNoticeVersionByTelegramUserId(
		parsed.data.telegramUserId,
		parsed.data.noticeVersion,
		dependencies.database,
	);
	if (acknowledgedVersion.err) return failure("storage_error");
	if (acknowledgedVersion.val === null) return failure("unauthorized");
	return success(privacyNoticeState(acknowledgedVersion.val));
}

export async function listTelegramExpenses(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<ListTelegramExpensesResult> {
	const parsed = ListTelegramExpensesRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return failure(actor.kind);
	const page = await listExpenses(mapListQuery(parsed.data.query), {
		currentParticipantId: actor.actor.participantId,
		database: dependencies.database,
		participantScopeId: actor.actor.participantId,
	});
	if (page.err) return failure("storage_error");
	try {
		const data: TelegramExpensePageDto = {
			expenses: page.val.expenses.map(mapExpenseSummary),
			page: page.val.page,
			pageSize: page.val.pageSize,
			total: page.val.total,
		};
		return success(data);
	} catch {
		return failure("storage_error");
	}
}

export async function getTelegramExpense(
	request: unknown,
	dependencies: TelegramConversationServiceDependencies,
): Promise<GetTelegramExpenseResult> {
	const parsed = GetTelegramExpenseRequestSchema.safeParse(request);
	if (!parsed.success) return failure("invalid_request");
	const actor = await resolveActor(parsed.data.telegramUserId, dependencies.database);
	if (actor.kind !== "found") return failure(actor.kind);
	const expense = await findExpenseById(parsed.data.expenseId, dependencies.database);
	if (expense.err) return failure("storage_error");
	if (
		!expense.val ||
		(expense.val.payer.id !== actor.actor.participantId &&
			!expense.val.shares.some((share) => share.participant.id === actor.actor.participantId))
	) {
		return failure("not_found");
	}
	try {
		return success(mapExpenseDetail(expense.val));
	} catch {
		return failure("storage_error");
	}
}
