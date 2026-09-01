import { z } from "zod";
import type { PaymentProofContentType } from "@/lib/const/payment-proofs";
import type { ReceiptContentType } from "@/lib/const/receipts";
import type { ShareStatus } from "@/lib/types/expense";
import { TelegramRpcUserIdSchema } from "./expense-contract";

export const TELEGRAM_CONVERSATION_RPC_VERSION = 1 as const;

const TelegramConversationActorRequestSchema = z
	.object({
		telegramUserId: TelegramRpcUserIdSchema,
		version: z.literal(TELEGRAM_CONVERSATION_RPC_VERSION),
	})
	.strict();

export const GetTelegramExpenseContextRequestSchema = TelegramConversationActorRequestSchema;

export const GetTelegramBalanceRequestSchema = TelegramConversationActorRequestSchema;

export const TelegramExpenseListQuerySchema = z
	.object({
		kindId: z.string().trim().min(1).optional(),
		page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
		pageSize: z.number().int().min(1).max(10).default(10),
		payerId: z.string().trim().min(1).optional(),
		pending: z.enum(["all", "true", "false", "mine"]).default("all"),
		q: z.string().trim().max(120).optional(),
	})
	.strict();

export const ListTelegramExpensesRequestSchema = TelegramConversationActorRequestSchema.extend({
	query: TelegramExpenseListQuerySchema,
}).strict();

export const GetTelegramExpenseRequestSchema = TelegramConversationActorRequestSchema.extend({
	expenseId: z.string().trim().min(1),
}).strict();

export type GetTelegramExpenseContextRequest = z.infer<
	typeof GetTelegramExpenseContextRequestSchema
>;
export type GetTelegramBalanceRequest = z.infer<typeof GetTelegramBalanceRequestSchema>;
export type ListTelegramExpensesRequest = z.input<typeof ListTelegramExpensesRequestSchema>;
export type GetTelegramExpenseRequest = z.infer<typeof GetTelegramExpenseRequestSchema>;

export interface TelegramParticipantDto {
	id: string;
	name: string;
	slug: string;
	sortOrder: number;
}

export interface TelegramExpenseKindDto {
	id: string;
	name: string;
	sortOrder: number;
}

export interface TelegramExpenseShareDto {
	participant: TelegramParticipantDto;
	shareAmountMinor: number;
	status: ShareStatus;
}

export interface TelegramConversationExpenseSummaryDto {
	amountMinor: number;
	currency: "CLP";
	description: string | null;
	expenseDate: string;
	hasReceipt: boolean;
	id: string;
	kind: TelegramExpenseKindDto;
	name: string;
	payer: TelegramParticipantDto;
	shares: TelegramExpenseShareDto[];
	splitMode: "custom" | "equal" | "open";
}

export interface TelegramConversationExpenseDetailDto extends TelegramConversationExpenseSummaryDto {
	createdAt: string;
	receipt: {
		contentType: ReceiptContentType;
		filename: string;
		sizeBytes: number;
	} | null;
	updatedAt: string;
}

export interface TelegramExpenseContextDto {
	caller: {
		displayName: string;
		participant: TelegramParticipantDto;
	};
	categories: TelegramExpenseKindDto[];
	currencies: ["CLP"];
	fileLimits: {
		paymentProofs: {
			contentTypes: PaymentProofContentType[];
			maxBytes: number;
		};
		receipts: {
			contentTypes: ReceiptContentType[];
			maxBytes: number;
		};
	};
	participants: TelegramParticipantDto[];
	splitModes: ["equal", "custom"];
}

export interface TelegramDebtByParticipantDto {
	amountDueToMeExpenseCount: number;
	amountDueToMeMinor: number;
	amountOwedExpenseCount: number;
	amountOwedMinor: number;
	participant: TelegramParticipantDto;
}

export interface TelegramBalanceDto {
	amountDueToMeMinor: number;
	amountOwedMinor: number;
	currency: "CLP";
	debtsByParticipant: TelegramDebtByParticipantDto[];
	dueToMeExpenseCount: number;
	expectedSpendMinor: number;
	owedExpenseCount: number;
	participantId: string;
	recentExpenses: TelegramConversationExpenseSummaryDto[];
	spentSoFarMinor: number;
}

export interface TelegramExpensePageDto {
	expenses: TelegramConversationExpenseSummaryDto[];
	page: number;
	pageSize: number;
	total: number;
}

export type TelegramReadFailureKind =
	"invalid_request" | "not_found" | "storage_error" | "unauthorized";

export type TelegramReadResult<T> =
	{ data: T; kind: "ok"; version: 1 } | { kind: TelegramReadFailureKind; version: 1 };

export type GetTelegramExpenseContextResult = TelegramReadResult<TelegramExpenseContextDto>;
export type GetTelegramBalanceResult = TelegramReadResult<TelegramBalanceDto>;
export type ListTelegramExpensesResult = TelegramReadResult<TelegramExpensePageDto>;
export type GetTelegramExpenseResult = TelegramReadResult<TelegramConversationExpenseDetailDto>;
