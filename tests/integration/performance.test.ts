import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDashboardSummary } from "@/lib/db/dashboard";
import { listExpenses } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("1,000 expense query performance", () => {
	let bindings: TestBindings;
	beforeEach(async () => {
		bindings = await createTestBindings();
		const statements: D1PreparedStatement[] = [];
		for (let index = 0; index < 1_000; index += 1) {
			const expenseId = `performance-expense-${index}`;
			const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
			statements.push(
				bindings.database
					.prepare(
						"INSERT INTO expenses (id, name, amount_minor, currency, expense_date, paid_by_participant_id, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, 'CLP', ?, ?, 'performance-user', ?, ?)",
					)
					.bind(
						expenseId,
						`Gasto ${index}`,
						3000,
						`2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
						"participant_alvaro",
						timestamp,
						timestamp,
					),
			);
			for (const [participantIndex, participantId] of [
				"participant_alvaro",
				"participant_camila",
				"participant_trinidad",
			].entries()) {
				statements.push(
					bindings.database
						.prepare(
							"INSERT INTO expense_shares (id, expense_id, participant_id, share_amount_minor, status, paid_to_participant_id, created_at, updated_at) VALUES (?, ?, ?, 1000, ?, ?, ?, ?)",
						)
						.bind(
							`performance-share-${index}-${participantIndex}`,
							expenseId,
							participantId,
							participantIndex === 0 ? "settled" : "pending",
							participantIndex === 0 ? null : "participant_alvaro",
							timestamp,
							timestamp,
						),
				);
			}
		}
		await bindings.database
			.prepare(
				"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, created_at, updated_at) VALUES ('performance-user', 'performance', 'hash', 'Performance', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
			)
			.run();
		for (let index = 0; index < statements.length; index += 100)
			await bindings.database.batch(statements.slice(index, index + 100));
	}, 60_000);
	afterEach(async () => bindings.dispose());

	it("loads the first list page and complete dashboard under one second each", async () => {
		const listStarted = performance.now();
		const list = await listExpenses({ page: 1, pageSize: 25 }, bindings.database);
		const listDuration = performance.now() - listStarted;
		const dashboardStarted = performance.now();
		const dashboard = await getDashboardSummary(bindings.database);
		const dashboardDuration = performance.now() - dashboardStarted;
		expect(list.ok && list.val.total).toBe(1_000);
		expect(dashboard.ok && dashboard.val.expenseCount).toBe(1_000);
		expect(listDuration).toBeLessThan(1_000);
		expect(dashboardDuration).toBeLessThan(1_000);
	});
});
