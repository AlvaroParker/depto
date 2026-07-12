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
	it("accepts exact custom and open allocations, including zero shares", () => {
		const allocations = [
			{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
			{ participantId: "participant_camila", shareAmountMinor: 4_000 },
			{ participantId: "participant_trinidad", shareAmountMinor: 0 },
		];
		expect(
			ExpenseCreateInputSchema.safeParse({
				...validExpense,
				shareAllocations: allocations,
				splitMode: "custom",
			}).success,
		).toBe(true);
		expect(
			ExpenseCreateInputSchema.safeParse({
				...validExpense,
				shareAllocations: allocations,
				splitMode: "open",
			}).success,
		).toBe(true);
	});

	it.each([
		["missing allocations", undefined],
		[
			"a missing participant",
			[
				{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
				{ participantId: "participant_camila", shareAmountMinor: 4_000 },
			],
		],
		[
			"a duplicate participant",
			[
				{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
				{ participantId: "participant_camila", shareAmountMinor: 2_000 },
				{ participantId: "participant_camila", shareAmountMinor: 2_000 },
			],
		],
		[
			"an inexact total",
			[
				{ participantId: "participant_alvaro", shareAmountMinor: 5_000 },
				{ participantId: "participant_camila", shareAmountMinor: 3_000 },
				{ participantId: "participant_trinidad", shareAmountMinor: 1_000 },
			],
		],
	])("rejects custom splitting with %s", (_case, shareAllocations) => {
		const result = ExpenseCreateInputSchema.safeParse({
			...validExpense,
			shareAllocations,
			splitMode: "custom",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.some((issue) => issue.path[0] === "shareAllocations")).toBe(true);
	});

	it("rejects marking a zero allocation paid", () => {
		const result = ExpenseCreateInputSchema.safeParse({
			...validExpense,
			initialPaidParticipantIds: ["participant_trinidad"],
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
				{ participantId: "participant_camila", shareAmountMinor: 4_000 },
				{ participantId: "participant_trinidad", shareAmountMinor: 0 },
			],
			splitMode: "open",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.some((issue) => issue.path[0] === "initialPaidParticipantIds")).toBe(
			true,
		);
	});

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
