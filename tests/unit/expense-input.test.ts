import { describe, expect, it } from "vitest";
import { ExpenseCreateInputSchema, ExpensePatchSchema } from "@/lib/types/expense";

const validExpense = {
	amountMinor: 10_000,
	currency: "CLP" as const,
	expenseDate: "2026-07-11",
	kindId: "kind-other",
	name: "Supermercado",
	paidByParticipantId: "participant_alvaro",
	participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
};

describe("expense creation input", () => {
	it("accepts omitted, empty, and multiple initial paid participants", () => {
		expect(ExpenseCreateInputSchema.safeParse(validExpense).success).toBe(true);
		expect(
			ExpenseCreateInputSchema.safeParse({ ...validExpense, initialPaidParticipantIds: [] })
				.success,
		).toBe(true);
		expect(
			ExpenseCreateInputSchema.safeParse({
				...validExpense,
				initialPaidParticipantIds: ["participant_camila", "participant_trinidad"],
			}).success,
		).toBe(true);
	});

	it.each([
		["the payer", ["participant_alvaro"]],
		["an unselected participant", ["participant_unknown"]],
		["a duplicate participant", ["participant_camila", "participant_camila"]],
	])("rejects %s in the initial paid selection", (_case, initialPaidParticipantIds) => {
		const result = ExpenseCreateInputSchema.safeParse({
			...validExpense,
			initialPaidParticipantIds,
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.some((issue) => issue.path[0] === "initialPaidParticipantIds")).toBe(
			true,
		);
	});

	it("keeps the initial paid field out of expense edits", () => {
		const result = ExpensePatchSchema.parse({
			...validExpense,
			initialPaidParticipantIds: ["participant_camila"],
		});

		expect(result).not.toHaveProperty("initialPaidParticipantIds");
	});
});
