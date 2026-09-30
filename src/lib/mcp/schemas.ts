import { z } from "zod";
import { ExpenseDateSchema, ExpenseFieldsSchema } from "@/lib/types/expense";
import { ExpenseKindIconKeySchema } from "@/lib/types/expense-kind";

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const ParticipantSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	sortOrder: z.number().int(),
});
export const KindSchema = z.object({
	id: z.string(),
	name: z.string(),
	iconKey: ExpenseKindIconKeySchema,
	sortOrder: z.number().int(),
});
export const FileMetadataSchema = z.object({
	filename: z.string(),
	contentType: z.string(),
	sizeBytes: money,
});
const ProofSchema = FileMetadataSchema.extend({
	uploadedAt: z.string(),
	uploadedByUserId: z.string(),
});
export const ShareSchema = z.object({
	id: z.string(),
	participant: ParticipantSchema,
	shareAmountMinor: money,
	status: z.enum(["settled", "pending", "paid"]),
	paidToParticipantId: z.string().nullable(),
	paidAt: z.string().nullable(),
	markedByUserId: z.string().nullable(),
	paymentProof: ProofSchema.nullable(),
});
export const ExpenseSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	amountMinor: money,
	currency: z.string(),
	expenseDate: z.string(),
	payer: ParticipantSchema,
	hasReceipt: z.boolean(),
	kind: KindSchema,
	shares: z.array(ShareSchema),
	splitMode: z.enum(["equal", "custom", "open"]),
});
export const ExpenseSchema = ExpenseSummarySchema.extend({
	receiptFilename: z.string().nullable(),
	receiptContentType: z.string().nullable(),
	receiptSizeBytes: money.nullable(),
	createdByUserId: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export const PageSchema = z.object({
	expenses: z.array(ExpenseSummarySchema),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: money,
});
export const BalanceSchema = z.object({
	view: z.literal("personal"),
	participantId: z.string(),
	amountOwedMinor: money,
	owedExpenseCount: money,
	amountDueToMeMinor: money,
	dueToMeExpenseCount: money,
	spentSoFarMinor: money,
	expectedSpendMinor: money,
	debtsByParticipant: z.array(
		z.object({
			participant: ParticipantSchema,
			amountOwedMinor: money,
			amountDueToMeMinor: money,
			amountOwedExpenseCount: money,
			amountDueToMeExpenseCount: money,
		}),
	),
	recentExpenses: z.array(ExpenseSummarySchema),
});
export const DebtInputSchema = z.object({
	counterpartyId: z
		.string()
		.min(1)
		.describe("ID de la otra persona; consulta primero los datos de referencia."),
	direction: z
		.enum(["due_to_caller", "owed_by_caller"])
		.describe("due_to_caller: me debe; owed_by_caller: le debo."),
	page: z.number().int().min(1).max(1_000_000).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
});
export const DebtSchema = z.object({
	totalAmountMinor: money,
	totalExpenseCount: money,
	expenses: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			expenseDate: z.string(),
			shareAmountMinor: money,
		}),
	),
	page: z.number().int(),
	pageSize: z.number().int(),
});
export const ReportInputSchema = z
	.object({
		dateFrom: ExpenseDateSchema.describe("Inicio inclusivo, YYYY-MM-DD."),
		dateTo: ExpenseDateSchema.describe("Fin inclusivo, YYYY-MM-DD."),
		payer: z.string().optional(),
		kind: z.string().optional(),
	})
	.refine((input) => input.dateFrom <= input.dateTo, {
		path: ["dateTo"],
		message: "La fecha final debe ser igual o posterior a la inicial.",
	});
export const ReportSchema = z.object({
	dateFrom: z.string(),
	dateTo: z.string(),
	currency: z.literal("CLP"),
	totalAmountMinor: money,
	expenseCount: money,
	groups: z.array(
		z.object({
			kindId: z.string(),
			kindName: z.string(),
			payerId: z.string(),
			payerName: z.string(),
			amountMinor: money,
			expenseCount: money,
		}),
	),
});
export const PaymentSchema = z.object({
	amountPaidMinor: money,
	paidAt: z.string(),
	paidExpenseCount: money,
	paidToParticipant: ParticipantSchema,
	proofAttached: z.boolean(),
});

export const expenseInputShape = {
	...ExpenseFieldsSchema.shape,
	amountMinor: ExpenseFieldsSchema.shape.amountMinor.describe(
		"Total en pesos CLP enteros, sin decimales; 1000 representa $1.000.",
	),
	expenseDate: ExpenseDateSchema.describe("Fecha del gasto en YYYY-MM-DD."),
	paidByParticipantId: ExpenseFieldsSchema.shape.paidByParticipantId.describe(
		"ID de quien pagó. Debe participar en divisiones abiertas.",
	),
	participantIds: ExpenseFieldsSchema.shape.participantIds.describe(
		"IDs de quienes reciben una parte; usa get_expense_reference_data.",
	),
	shareAllocations: ExpenseFieldsSchema.shape.shareAllocations.describe(
		"Obligatorio para custom/open: una entrada por participante; la suma debe igualar amountMinor. Omitir en equal.",
	),
};
