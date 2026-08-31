import { z } from "zod";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/const/currencies";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";
import type { PaymentProof } from "@/lib/types/payment-proof";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const ExpenseSplitModeSchema = z.enum(["equal", "custom", "open"]);
export type ExpenseSplitMode = z.infer<typeof ExpenseSplitModeSchema>;

export const ExpenseShareAllocationSchema = z.object({
	participantId: z.string().trim().min(1),
	shareAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export interface ExpenseShareAllocation {
	participantId: string;
	shareAmountMinor: number;
}

function isCalendarDate(value: string): boolean {
	if (!datePattern.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

const ExpenseFieldsSchema = z.object({
	amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	currency: z.enum(SUPPORTED_CURRENCIES).default(DEFAULT_CURRENCY),
	description: z.string().trim().max(2000).nullable().optional(),
	expenseDate: z.string().refine(isCalendarDate, "La fecha no es válida."),
	kindId: z.string().trim().min(1, "Selecciona una categoría."),
	name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
	paidByParticipantId: z.string().trim().min(1, "Selecciona quién pagó."),
	participantIds: z
		.array(z.string().trim().min(1))
		.min(1, "Selecciona al menos una persona.")
		.refine((ids) => new Set(ids).size === ids.length, "No repitas participantes."),
	shareAllocations: z.array(ExpenseShareAllocationSchema).optional(),
	splitMode: ExpenseSplitModeSchema.optional(),
});

function validateSplitConfiguration(
	input: z.infer<typeof ExpenseFieldsSchema>,
	context: z.RefinementCtx,
): void {
	const splitMode = input.splitMode ?? "equal";
	const allocations = input.shareAllocations ?? [];
	if (splitMode === "open" && !input.participantIds.includes(input.paidByParticipantId)) {
		context.addIssue({
			code: "custom",
			message: "En una cuenta abierta, quien pagó debe recibir una parte.",
			path: ["paidByParticipantId"],
		});
	}
	if (splitMode === "equal") {
		if (allocations.length > 0) {
			context.addIssue({
				code: "custom",
				message: "La división igual no acepta montos manuales.",
				path: ["shareAllocations"],
			});
		}
		return;
	}
	const allocationIds = allocations.map((allocation) => allocation.participantId);
	if (
		allocations.length !== input.participantIds.length ||
		new Set(allocationIds).size !== allocationIds.length ||
		input.participantIds.some((participantId) => !allocationIds.includes(participantId))
	) {
		context.addIssue({
			code: "custom",
			message: "Define un monto para cada participante seleccionado.",
			path: ["shareAllocations"],
		});
		return;
	}
	const allocatedTotal = allocations.reduce(
		(sum, allocation) => sum + allocation.shareAmountMinor,
		0,
	);
	if (!Number.isSafeInteger(allocatedTotal) || allocatedTotal !== input.amountMinor) {
		context.addIssue({
			code: "custom",
			message: "Los montos deben sumar exactamente el total del gasto.",
			path: ["shareAllocations"],
		});
	}
}

export const ExpenseInputSchema = ExpenseFieldsSchema.superRefine(validateSplitConfiguration);

export const ExpenseCreateInputSchema = ExpenseFieldsSchema.extend({
	initialPaidParticipantIds: z
		.array(z.string().trim().min(1))
		.refine((ids) => new Set(ids).size === ids.length, "No repitas participantes pagados.")
		.optional(),
	sendEmailNotifications: z.boolean().default(true),
}).superRefine((input, context) => {
	validateSplitConfiguration(input, context);
	if (input.initialPaidParticipantIds?.includes(input.paidByParticipantId)) {
		context.addIssue({
			code: "custom",
			message: "Quien pagó no puede marcarse como reembolsado.",
			path: ["initialPaidParticipantIds"],
		});
	}
	if (
		input.initialPaidParticipantIds?.some(
			(participantId) => !input.participantIds.includes(participantId),
		)
	) {
		context.addIssue({
			code: "custom",
			message: "Cada persona marcada como pagada debe participar en el gasto.",
			path: ["initialPaidParticipantIds"],
		});
	}
	const allocationByParticipant = new Map(
		(input.shareAllocations ?? []).map((allocation) => [
			allocation.participantId,
			allocation.shareAmountMinor,
		]),
	);
	if (
		input.initialPaidParticipantIds?.some(
			(participantId) => allocationByParticipant.get(participantId) === 0,
		)
	) {
		context.addIssue({
			code: "custom",
			message: "Un monto de $0 no se puede marcar como pagado.",
			path: ["initialPaidParticipantIds"],
		});
	}
});

export const ExpensePatchSchema = ExpenseFieldsSchema.extend({
	resetPaidReimbursements: z.boolean().default(false),
}).superRefine(validateSplitConfiguration);

export const ExpenseQuerySchema = z.object({
	kind: z.string().trim().optional(),
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(25),
	payer: z.string().trim().optional(),
	pending: z
		.enum(["all", "true", "false", "mine"])
		.transform((value) =>
			value === "all" ? undefined : value === "mine" ? value : value === "true",
		)
		.optional(),
	q: z.string().trim().max(120).optional(),
});

export const ShareStatusInputSchema = z.object({
	status: z.enum(["pending", "paid"]),
});

export const OpenShareAmountInputSchema = z.object({
	shareAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
export type ExpenseCreateInput = z.input<typeof ExpenseCreateInputSchema>;
export type ExpensePatch = z.infer<typeof ExpensePatchSchema>;
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;

export type ShareStatus = "settled" | "pending" | "paid";

export interface ExpenseShare {
	id: string;
	participant: Participant;
	shareAmountMinor: number;
	status: ShareStatus;
	paidToParticipantId: string | null;
	paidAt: string | null;
	markedByUserId: string | null;
	paymentProof: PaymentProof | null;
}

export interface ExpenseSummary {
	id: string;
	name: string;
	description: string | null;
	amountMinor: number;
	currency: string;
	expenseDate: string;
	payer: Participant;
	hasReceipt: boolean;
	kind: ExpenseKind;
	shares: ExpenseShare[];
	splitMode: ExpenseSplitMode;
}

export interface OpenShareAmountResponse {
	shares: ExpenseShare[];
}

export interface ExpenseDetail extends ExpenseSummary {
	receiptFilename: string | null;
	receiptContentType: string | null;
	receiptSizeBytes: number | null;
	createdByUserId: string;
	createdAt: string;
	updatedAt: string;
}

export interface ExpensePage {
	expenses: ExpenseSummary[];
	page: number;
	pageSize: number;
	total: number;
}
