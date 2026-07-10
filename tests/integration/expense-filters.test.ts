import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense, listExpenses, softDeleteExpense } from "@/lib/db/expenses";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T21:00:00.000Z");

describe("expense search and filters", () => {
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

	it("combines search, payer, pending, stable sorting, pagination, and deletion exclusion", async () => {
		const fixtures = [
			{
				date: "2026-07-08",
				description: "feria del barrio",
				name: "Verduras",
				payer: "participant_camila",
			},
			{
				date: "2026-07-09",
				description: "compra semanal",
				name: "Mercado",
				payer: "participant_camila",
			},
			{ date: "2026-07-09", description: "para la once", name: "Pan", payer: "participant_alvaro" },
		];
		const created = [];
		for (const [index, item] of fixtures.entries()) {
			const result = await createExpense(
				{
					amountMinor: 3000,
					currency: "CLP",
					expenseDate: item.date,
					name: item.name,
					description: item.description,
					paidByParticipantId: item.payer,
					participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				},
				"user_alvaro",
				bindings.database,
				new Date(NOW.getTime() + index * 1000),
			);
			if (result.err) throw new Error("fixture failed");
			created.push(result.val);
		}
		for (const share of created[0].shares.filter((item) => item.status === "pending"))
			await updateShareStatus(share.id, "paid", "user_alvaro", bindings.database, NOW);

		const combined = await listExpenses(
			{ payer: "participant_camila", pending: true, q: " compra " },
			bindings.database,
		);
		expect(combined.ok && combined.val.expenses.map((expense) => expense.name)).toEqual([
			"Mercado",
		]);
		const settled = await listExpenses({ pending: false }, bindings.database);
		expect(settled.ok && settled.val.expenses.map((expense) => expense.name)).toEqual(["Verduras"]);
		const firstPage = await listExpenses({ page: 1, pageSize: 2 }, bindings.database);
		const secondPage = await listExpenses({ page: 2, pageSize: 2 }, bindings.database);
		expect(firstPage.ok && firstPage.val.expenses.map((expense) => expense.name)).toEqual([
			"Pan",
			"Mercado",
		]);
		expect(secondPage.ok && secondPage.val.expenses.map((expense) => expense.name)).toEqual([
			"Verduras",
		]);

		await softDeleteExpense(created[2].id, bindings.database, NOW);
		const active = await listExpenses({}, bindings.database);
		expect(active.ok && active.val.expenses.map((expense) => expense.name)).toEqual([
			"Mercado",
			"Verduras",
		]);
	});
});
