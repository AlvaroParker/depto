import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDashboardSummary } from "@/lib/db/dashboard";
import { createExpense } from "@/lib/db/expenses";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T18:00:00.000Z");

describe("dashboard aggregates", () => {
	let bindings: TestBindings;
	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				"user_alvaro",
				"alvaro",
				"hash",
				"Alvaro",
				"participant_alvaro",
				NOW.toISOString(),
				NOW.toISOString(),
			)
			.run();
	});
	afterEach(async () => bindings.dispose());

	it("calculates totals, net balances, pending matrix, and recent expenses", async () => {
		const first = await createExpense(
			{
				amountMinor: 9_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-08",
				name: "Gas",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const second = await createExpense(
			{
				amountMinor: 6_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-09",
				name: "Agua",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			new Date(NOW.getTime() + 1000),
		);
		if (first.err || second.err) throw new Error("fixture failed");
		await updateShareStatus(first.val.shares[1].id, "paid", "user_alvaro", bindings.database, NOW);

		const result = await getDashboardSummary({ database: bindings.database });
		expect(result.ok).toBe(true);
		if (result.err) return;
		if (result.val.view !== "household") throw new Error("expected household dashboard");
		expect(result.val).toMatchObject({
			expenseCount: 2,
			pendingTotalMinor: 7_000,
			totalAmountMinor: 15_000,
		});
		expect(
			result.val.balances.map((balance) => [
				balance.participant.name,
				balance.totalPaidMinor,
				balance.totalShareMinor,
				balance.netBalanceMinor,
			]),
		).toEqual([
			["Alvaro", 9_000, 5_000, 1_000],
			["Camila", 6_000, 5_000, 4_000],
			["Trinidad", 0, 5_000, -5_000],
		]);
		expect(
			result.val.pendingMatrix.map((transfer) => [
				transfer.from.name,
				transfer.to.name,
				transfer.amountMinor,
			]),
		).toEqual([
			["Alvaro", "Camila", 2_000],
			["Trinidad", "Alvaro", 3_000],
			["Trinidad", "Camila", 2_000],
		]);
		expect(result.val.recentExpenses.map((expense) => expense.name)).toEqual(["Agua", "Gas"]);
	});

	it("removes completed reimbursements from each participant's net balance", async () => {
		const expense = await createExpense(
			{
				amountMinor: 15_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-09",
				name: "Compra compartida",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (expense.err) throw new Error("fixture failed");

		await updateShareStatus(
			expense.val.shares[0].id,
			"paid",
			"user_alvaro",
			bindings.database,
			NOW,
		);

		const result = await getDashboardSummary({ database: bindings.database });
		expect(result.ok).toBe(true);
		if (result.err) return;
		if (result.val.view !== "household") throw new Error("expected household dashboard");
		expect(
			result.val.balances.map((balance) => [balance.participant.name, balance.netBalanceMinor]),
		).toEqual([
			["Alvaro", 0],
			["Camila", 5_000],
			["Trinidad", -5_000],
		]);
	});

	it("calculates a participant's cash spend, final share, debts, and recent expenses", async () => {
		const paidByAlvaro = await createExpense(
			{
				amountMinor: 9_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-08",
				name: "Gas personal",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const paidByCamila = await createExpense(
			{
				amountMinor: 6_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-09",
				name: "Agua personal",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			new Date(NOW.getTime() + 1_000),
		);
		const unrelated = await createExpense(
			{
				amountMinor: 5_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-10",
				name: "Gasto ajeno",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_camila"],
			},
			"user_alvaro",
			bindings.database,
			new Date(NOW.getTime() + 2_000),
		);
		if (paidByAlvaro.err || paidByCamila.err || unrelated.err) throw new Error("fixture failed");

		await updateShareStatus(
			paidByAlvaro.val.shares[1].id,
			"paid",
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const initial = await getDashboardSummary({
			currentParticipantId: "participant_alvaro",
			database: bindings.database,
		});
		expect(initial.ok).toBe(true);
		if (initial.err || initial.val.view !== "personal") return;
		expect(initial.val).toMatchObject({
			amountDueToMeMinor: 3_000,
			amountOwedMinor: 2_000,
			dueToMeExpenseCount: 1,
			expectedSpendMinor: 5_000,
			owedExpenseCount: 1,
			spentSoFarMinor: 6_000,
		});
		expect(initial.val.recentExpenses.map((expense) => expense.name)).toEqual([
			"Agua personal",
			"Gas personal",
		]);

		await updateShareStatus(
			paidByCamila.val.shares[0].id,
			"paid",
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const afterPayment = await getDashboardSummary({
			currentParticipantId: "participant_alvaro",
			database: bindings.database,
		});
		expect(afterPayment.ok).toBe(true);
		if (afterPayment.err || afterPayment.val.view !== "personal") return;
		expect(afterPayment.val).toMatchObject({
			amountOwedMinor: 0,
			expectedSpendMinor: 5_000,
			owedExpenseCount: 0,
			spentSoFarMinor: 8_000,
		});

		await bindings.database
			.prepare("UPDATE expenses SET deleted_at = ? WHERE id = ?")
			.bind(NOW.toISOString(), paidByCamila.val.id)
			.run();
		const afterDeletion = await getDashboardSummary({
			currentParticipantId: "participant_alvaro",
			database: bindings.database,
		});
		expect(afterDeletion.ok).toBe(true);
		if (afterDeletion.err || afterDeletion.val.view !== "personal") return;
		expect(afterDeletion.val).toMatchObject({
			expectedSpendMinor: 3_000,
			spentSoFarMinor: 6_000,
		});
		expect(afterDeletion.val.recentExpenses.map((expense) => expense.name)).toEqual([
			"Gas personal",
		]);
	});

	it("returns zero personal totals when the participant has no expenses", async () => {
		const result = await getDashboardSummary({
			currentParticipantId: "participant_alvaro",
			database: bindings.database,
		});
		expect(result.ok).toBe(true);
		if (result.err || result.val.view !== "personal") return;
		expect(result.val).toMatchObject({
			amountDueToMeMinor: 0,
			amountOwedMinor: 0,
			dueToMeExpenseCount: 0,
			expectedSpendMinor: 0,
			owedExpenseCount: 0,
			spentSoFarMinor: 0,
		});
		expect(result.val.recentExpenses).toEqual([]);
	});
});
