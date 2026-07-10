import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpenseKindIcon } from "@/components/expenses/expense-kind-icon";
import { EXPENSE_KIND_ICON_KEYS } from "@/lib/const/expense-kinds";
import { ExpenseKindInputSchema } from "@/lib/types/expense-kind";

describe("expense kind icons", () => {
	it("keeps the icon registry and validation schema aligned", () => {
		for (const iconKey of EXPENSE_KIND_ICON_KEYS) {
			expect(ExpenseKindInputSchema.safeParse({ iconKey, name: "Categoría" }).success).toBe(true);
		}
		expect(
			ExpenseKindInputSchema.safeParse({ iconKey: "arbitrary-code", name: "Inválida" }).success,
		).toBe(false);
	});

	it("falls back to the Otros icon for unknown persisted values", () => {
		const fallback = renderToStaticMarkup(<ExpenseKindIcon iconKey="unknown" />);
		const other = renderToStaticMarkup(<ExpenseKindIcon iconKey="other" />);
		expect(fallback).toBe(other);
	});
});
