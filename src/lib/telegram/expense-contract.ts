import { z } from "zod";
import { MAX_RECEIPT_SIZE_BYTES } from "@/lib/const/receipts";

export const TELEGRAM_EXPENSE_RPC_VERSION = 1 as const;
export const TELEGRAM_EXPENSE_IDEMPOTENCY_TOOL = "telegram_create_expense";

const telegramUserIdSchema = z
	.string()
	.regex(/^[1-9][0-9]{0,12}$/)
	.refine((value) => BigInt(value) <= 1_099_511_627_775n);

const calendarDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const [year, month, day] = value.split("-").map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		return (
			date.getUTCFullYear() === year &&
			date.getUTCMonth() === month - 1 &&
			date.getUTCDate() === day
		);
	});

const TelegramExpenseIdentitySchema = z
	.object({
		telegramUserId: telegramUserIdSchema,
		updateId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		version: z.literal(TELEGRAM_EXPENSE_RPC_VERSION),
	})
	.strict();

export const TelegramReceiptInputSchema = z
	.object({
		contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
		filename: z.string().trim().min(1).max(255),
		sizeBytes: z.number().int().min(1).max(MAX_RECEIPT_SIZE_BYTES),
	})
	.strict();

const TelegramShareAllocationSchema = z
	.object({
		participantId: z.string().trim().min(1),
		shareAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
	})
	.strict();

export const TelegramExpenseInputSchema = z
	.object({
		amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		description: z.string().trim().max(2000).nullable(),
		expenseDate: calendarDateSchema,
		kindId: z.string().trim().min(1),
		name: z.string().trim().min(1).max(120),
		paidByParticipantId: z.string().trim().min(1),
		participantIds: z.array(z.string().trim().min(1)).min(1),
		shareAllocations: z.array(TelegramShareAllocationSchema),
		splitMode: z.enum(["equal", "custom"]),
	})
	.strict()
	.superRefine((input, context) => {
		if (new Set(input.participantIds).size !== input.participantIds.length) {
			context.addIssue({ code: "custom", message: "Duplicate participants." });
		}
		if (input.splitMode === "equal") {
			if (input.shareAllocations.length > 0) {
				context.addIssue({ code: "custom", message: "Equal splits cannot include allocations." });
			}
			return;
		}
		const allocationIds = input.shareAllocations.map(({ participantId }) => participantId);
		const total = input.shareAllocations.reduce(
			(sum, { shareAmountMinor }) => sum + shareAmountMinor,
			0,
		);
		if (
			input.shareAllocations.length !== input.participantIds.length ||
			new Set(allocationIds).size !== allocationIds.length ||
			input.participantIds.some((participantId) => !allocationIds.includes(participantId)) ||
			!Number.isSafeInteger(total) ||
			total !== input.amountMinor
		) {
			context.addIssue({ code: "custom", message: "Custom allocations must match the total." });
		}
	});

export const FindTelegramExpenseRequestSchema = TelegramExpenseIdentitySchema;

export const CreateTelegramExpenseRequestSchema = TelegramExpenseIdentitySchema.extend({
	expense: TelegramExpenseInputSchema,
	receipt: TelegramReceiptInputSchema.optional(),
}).strict();

export const AttachTelegramExpenseReceiptRequestSchema = TelegramExpenseIdentitySchema.extend({
	receipt: TelegramReceiptInputSchema,
}).strict();

export type FindTelegramExpenseRequest = z.infer<typeof FindTelegramExpenseRequestSchema>;
export type CreateTelegramExpenseRequest = z.infer<typeof CreateTelegramExpenseRequestSchema>;
export type AttachTelegramExpenseReceiptRequest = z.infer<
	typeof AttachTelegramExpenseReceiptRequestSchema
>;

export interface TelegramExpenseSummary {
	amountMinor: number;
	currency: "CLP";
	description: string | null;
	expenseDate: string;
	hasReceipt: boolean;
	id: string;
	kind: { id: string; name: string };
	name: string;
	payer: { id: string; name: string };
	shares: Array<{
		participant: { id: string; name: string };
		shareAmountMinor: number;
		status: "settled" | "pending" | "paid";
	}>;
	splitMode: "equal" | "custom";
}

type RpcFailureKind = "invalid_request" | "storage_error" | "unauthorized";

export type FindTelegramExpenseResult =
	| { expense: TelegramExpenseSummary; kind: "found"; version: 1 }
	| { kind: "in_progress" | "not_found" | RpcFailureKind; version: 1 };

export type CreateTelegramExpenseResult =
	| {
			expense: TelegramExpenseSummary;
			kind: "created" | "replayed";
			notification: "failed" | "not_sent" | "sent" | "skipped";
			receipt: "already_attached" | "attached" | "failed" | "not_provided";
			version: 1;
	  }
	| {
			kind: "idempotency_conflict" | "in_progress" | RpcFailureKind;
			version: 1;
	  };

export type AttachTelegramExpenseReceiptResult =
	| {
			expense: TelegramExpenseSummary;
			kind: "already_attached" | "attached";
			version: 1;
	  }
	| { kind: "in_progress" | "not_found" | RpcFailureKind; version: 1 };
