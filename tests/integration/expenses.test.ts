import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense, findExpenseById, listExpenses } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T15:30:00.000Z");

describe("expense persistence", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				"user_alvaro",
				"alvaro",
				"test-hash",
				"Alvaro",
				"participant_alvaro",
				NOW.toISOString(),
				NOW.toISOString(),
			)
			.run();
	});

	afterEach(async () => bindings.dispose());

	it("atomically creates the expense and exactly ordered shares", async () => {
		const result = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				description: "Compra semanal",
				expenseDate: "2026-07-08",
				name: "Supermercado",
				paidByParticipantId: "participant_alvaro",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);

		expect(result.ok).toBe(true);
		if (result.err) return;
		expect(result.val.shares.map((share) => share.shareAmountMinor)).toEqual([3_334, 3_333, 3_333]);
		expect(result.val.shares.map((share) => share.status)).toEqual([
			"settled",
			"pending",
			"pending",
		]);
		expect(result.val.shares.map((share) => share.paidToParticipantId)).toEqual([
			null,
			"participant_alvaro",
			"participant_alvaro",
		]);
	});

	it("lists and reads complete active expense information newest first", async () => {
		const older = await createExpense(
			{
				amountMinor: 30_000,
				currency: "CLP",
				expenseDate: "2026-07-01",
				name: "Internet",
				paidByParticipantId: "participant_camila",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		const newer = await createExpense(
			{
				amountMinor: 4_500,
				currency: "CLP",
				expenseDate: "2026-07-09",
				name: "Pan",
				paidByParticipantId: "participant_trinidad",
			},
			"user_alvaro",
			bindings.database,
			new Date(NOW.getTime() + 1_000),
		);
		expect(older.ok && newer.ok).toBe(true);
		if (older.err || newer.err) return;

		const page = await listExpenses({}, bindings.database);
		expect(page.ok).toBe(true);
		if (page.err) return;
		expect(page.val.total).toBe(2);
		expect(page.val.expenses.map((expense) => expense.name)).toEqual(["Pan", "Internet"]);
		expect(page.val.expenses.every((expense) => expense.shares.length === 3)).toBe(true);

		const detail = await findExpenseById(older.val.id, bindings.database);
		expect(detail.ok && detail.val?.name).toBe("Internet");
		expect(detail.ok && detail.val?.createdByUserId).toBe("user_alvaro");
	});

	it("writes nothing when the payer is not an active participant", async () => {
		const result = await createExpense(
			{
				amountMinor: 1_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				name: "Inválido",
				paidByParticipantId: "participant_unknown",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		expect(result.err).toBe(true);
		const expenseCount = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		const shareCount = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expense_shares")
			.first<{ count: number }>();
		expect(expenseCount?.count).toBe(0);
		expect(shareCount?.count).toBe(0);
	});
});
