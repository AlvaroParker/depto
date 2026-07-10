import { z } from "zod";
import { EXPENSE_KIND_ICON_KEYS, type ExpenseKindIconKey } from "@/lib/const/expense-kinds";

export const ExpenseKindIconKeySchema = z.enum(EXPENSE_KIND_ICON_KEYS);

const expenseKindNameSchema = z
	.string()
	.trim()
	.min(1, "Ingresa un nombre.")
	.max(60, "El nombre no puede superar los 60 caracteres.");

export const ExpenseKindInputSchema = z.object({
	iconKey: ExpenseKindIconKeySchema,
	name: expenseKindNameSchema,
});

export interface ExpenseKindInput extends z.infer<typeof ExpenseKindInputSchema> {
	iconKey: ExpenseKindIconKey;
}

export interface ExpenseKind {
	id: string;
	iconKey: ExpenseKindIconKey;
	name: string;
	sortOrder: number;
}

export interface ExpenseKindListResponse {
	kinds: ExpenseKind[];
}

export interface ExpenseKindResponse {
	kind: ExpenseKind;
}
