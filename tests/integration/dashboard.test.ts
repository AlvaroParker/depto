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
				expenseDate: "2026-07-08",
				name: "Gas",
				paidByParticipantId: "participant_alvaro",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const second = await createExpense(
			{
				amountMinor: 6_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				name: "Agua",
				paidByParticipantId: "participant_camila",
			},
			"user_alvaro",
			bindings.database,
			new Date(NOW.getTime() + 1000),
		);
		if (first.err || second.err) throw new Error("fixture failed");
		await updateShareStatus(first.val.shares[1].id, "paid", "user_alvaro", bindings.database, NOW);

		const result = await getDashboardSummary(bindings.database);
		expect(result.ok).toBe(true);
		if (result.err) return;
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
				expenseDate: "2026-07-09",
				name: "Compra compartida",
				paidByParticipantId: "participant_camila",
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

		const result = await getDashboardSummary(bindings.database);
		expect(result.ok).toBe(true);
		if (result.err) return;
		expect(
			result.val.balances.map((balance) => [balance.participant.name, balance.netBalanceMinor]),
		).toEqual([
			["Alvaro", 0],
			["Camila", 5_000],
			["Trinidad", -5_000],
		]);
	});
});
