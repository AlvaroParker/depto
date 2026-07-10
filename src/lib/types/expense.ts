import { z } from "zod";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/const/currencies";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
	if (!datePattern.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export const ExpenseInputSchema = z
	.object({
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
	})
	.refine((input) => input.participantIds.includes(input.paidByParticipantId), {
		message: "Quien pagó debe participar en el gasto.",
		path: ["paidByParticipantId"],
	});

export const ExpensePatchSchema = ExpenseInputSchema.extend({
	resetPaidReimbursements: z.boolean().default(false),
});

export const ExpenseQuerySchema = z.object({
	kind: z.string().trim().optional(),
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(25),
	payer: z.string().trim().optional(),
	pending: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.optional(),
	q: z.string().trim().max(120).optional(),
});

export const ShareStatusInputSchema = z.object({
	status: z.enum(["pending", "paid"]),
});

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
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
