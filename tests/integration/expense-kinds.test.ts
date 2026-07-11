import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createExpenseKind,
	findExpenseKindById,
	listExpenseKinds,
	updateExpenseKind,
} from "@/lib/db/expense-kinds";
import { createExpense, listExpenses } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("expense kinds", () => {
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

	it("seeds household categories and lets managers create and edit taxonomy records", async () => {
		const seeded = await listExpenseKinds(bindings.database);
		expect(seeded.ok && seeded.val.map(({ name }) => name)).toEqual([
			"Arriendo",
			"Gastos comunes",
			"Agua",
			"Luz",
			"Gas",
			"Internet",
			"Supermercado",
			"Comida",
			"Limpieza",
			"Electrodomésticos",
			"Muebles",
			"Reparaciones",
			"Transporte",
			"Salud",
			"Mascotas",
			"Educación",
			"Otros",
		]);

		const created = await createExpenseKind(
			{ iconKey: "travel", name: "Vacaciones" },
			bindings.database,
			NOW,
		);
		expect(created.ok && created.val.kind).toBe("created");
		if (created.err || created.val.kind !== "created") return;
		expect(created.val.expenseKind).toMatchObject({ iconKey: "travel", sortOrder: 18 });

		const duplicate = await createExpenseKind(
			{ iconKey: "gift", name: "vacaciones" },
			bindings.database,
			NOW,
		);
		expect(duplicate.ok && duplicate.val.kind).toBe("name_taken");

		const updated = await updateExpenseKind(
			created.val.expenseKind.id,
			{ iconKey: "gift", name: "Celebraciones" },
			bindings.database,
			NOW,
		);
		expect(updated.ok && updated.val.kind).toBe("updated");
		expect(
			(await findExpenseKindById(created.val.expenseKind.id, bindings.database)).val,
		).toMatchObject({ iconKey: "gift", name: "Celebraciones" });
	});

	it("persists category data on expenses and filters by it", async () => {
		for (const [name, kindId] of [
			["Cuenta de agua", "kind-water"],
			["Compra semanal", "kind-groceries"],
		] as const) {
			const result = await createExpense(
				{
					amountMinor: 12_000,
					currency: "CLP",
					expenseDate: "2026-07-10",
					kindId,
					name,
					paidByParticipantId: "participant_alvaro",
					participantIds: ["participant_alvaro", "participant_camila"],
				},
				"user_alvaro",
				bindings.database,
				NOW,
			);
			expect(result.ok && result.val.kind.id).toBe(kindId);
		}

		const filtered = await listExpenses({ kind: "kind-water" }, { database: bindings.database });
		expect(filtered.ok && filtered.val.expenses).toHaveLength(1);
		expect(filtered.ok && filtered.val.expenses[0].kind).toMatchObject({
			iconKey: "water",
			name: "Agua",
		});
	});
});
