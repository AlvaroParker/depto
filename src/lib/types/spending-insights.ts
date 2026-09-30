import { z } from "zod";
import { ExpenseDateSchema } from "./expense";
import { calendarMonthIndex } from "@/lib/util/spending-insights";

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const categoryFilter = z
	.string()
	.trim()
	.min(1)
	.optional()
	.describe("ID de categoría obtenido de get_expense_reference_data; omitir para todas.");
const payerFilter = z
	.string()
	.trim()
	.min(1)
	.optional()
	.describe("ID de quien pagó el gasto completo, no de quien recibe una parte.");

const dateFields = {
	dateFrom: ExpenseDateSchema.describe("Inicio inclusivo, YYYY-MM-DD, según la fecha del gasto."),
	dateTo: ExpenseDateSchema.describe("Fin inclusivo, YYYY-MM-DD, según la fecha del gasto."),
};

function validRange(range: { dateFrom: string; dateTo: string }) {
	return (
		range.dateFrom <= range.dateTo &&
		calendarMonthIndex(range.dateTo) - calendarMonthIndex(range.dateFrom) < 60
	);
}

const rangeError = {
	path: ["dateTo"],
	message: "Usa fechas ordenadas en un rango de hasta 60 meses calendario.",
};

export const SpendingRangeSchema = z.object(dateFields).refine(validRange, rangeError);
export const ExpenseComparisonInputSchema = z.object({
	period: SpendingRangeSchema.describe("Período que deseas analizar; indica fechas explícitas."),
	baseline: SpendingRangeSchema.describe("Período de referencia para calcular la variación."),
	kind: categoryFilter,
	payer: payerFilter,
});
export const ExpenseTrendsInputSchema = z
	.object({ ...dateFields, kind: categoryFilter, payer: payerFilter })
	.refine(validRange, rangeError);
export const MySpendingInputSchema = z
	.object({ ...dateFields, kind: categoryFilter })
	.refine(validRange, rangeError);

const periodFields = {
	...dateFields,
	dayCount: z.number().int().positive(),
	coversFullMonths: z.boolean(),
};
const filters = z.object({ kind: z.string().nullable(), payer: z.string().nullable() });
const totals = { totalAmountMinor: money, expenseCount: money };
const change = z.object({
	amountMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
	percent: z.number().nullable(),
});
const category = { kindId: z.string(), kindName: z.string() };
const categoryTotal = z.object({ ...category, amountMinor: money, expenseCount: money });

export const ExpenseComparisonSchema = z.object({
	currency: z.literal("CLP"),
	filters,
	period: z.object({ ...periodFields, ...totals }),
	baseline: z.object({ ...periodFields, ...totals }),
	sameDayCount: z.boolean(),
	change,
	categories: z.array(
		z.object({
			...category,
			periodAmountMinor: money,
			baselineAmountMinor: money,
			change,
		}),
	),
});
export const ExpenseTrendsSchema = z.object({
	...periodFields,
	...totals,
	currency: z.literal("CLP"),
	filters,
	months: z.array(
		z.object({
			...periodFields,
			...totals,
			month: z.string(),
			categories: z.array(categoryTotal),
		}),
	),
});
const personalAmounts = {
	allocatedAmountMinor: money,
	paidUpfrontAmountMinor: money,
	reimbursedAmountMinor: money,
	receivedReimbursementsAmountMinor: money,
	pendingToPayAmountMinor: money,
	pendingToReceiveAmountMinor: money,
	expenseCount: money,
};
export const MySpendingSchema = z.object({
	...periodFields,
	...personalAmounts,
	currency: z.literal("CLP"),
	participantId: z.string(),
	filters: z.object({ kind: z.string().nullable() }),
	dateBasis: z.literal("expense_date"),
	reimbursementBasis: z.literal("current_status"),
	categories: z.array(z.object({ ...category, ...personalAmounts })),
});

export type ExpenseComparisonInput = z.infer<typeof ExpenseComparisonInputSchema>;
export type ExpenseTrendsInput = z.infer<typeof ExpenseTrendsInputSchema>;
export type MySpendingInput = z.infer<typeof MySpendingInputSchema>;
export type ExpenseComparison = z.infer<typeof ExpenseComparisonSchema>;
export type ExpenseTrends = z.infer<typeof ExpenseTrendsSchema>;
export type MySpending = z.infer<typeof MySpendingSchema>;
