import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense } from "@/lib/db/expenses";
import { findExpenseNotificationRecipients } from "@/lib/db/participants";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("expense email recipients", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database.batch([
			bindings.database.prepare(
				"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('user-creator', 'creator', 'hash', 'Creator', NULL, 'admin', '2026-07-11T00:00:00.000Z', '2026-07-11T00:00:00.000Z')",
			),
			bindings.database
				.prepare("UPDATE participants SET email = ? WHERE id = ?")
				.bind("alvaro@example.com", "participant_alvaro"),
			bindings.database
				.prepare("UPDATE participants SET email = ? WHERE id = ?")
				.bind("camila@example.com", "participant_camila"),
		]);
	});

	afterEach(async () => bindings.dispose());

	it("returns only selected participants with configured emails and their exact shares", async () => {
		const kind = await bindings.database
			.prepare("SELECT id FROM expense_kinds ORDER BY sort_order LIMIT 1")
			.first<{ id: string }>();
		if (!kind) throw new Error("Missing expense kind fixture.");
		const created = await createExpense(
			{
				amountMinor: 10_001,
				currency: "CLP",
				description: null,
				expenseDate: "2026-07-11",
				kindId: kind.id,
				name: "Compra",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user-creator",
			bindings.database,
		);
		if (created.err) throw created.val;

		const recipients = await findExpenseNotificationRecipients(created.val.id, bindings.database);
		expect(recipients.ok && recipients.val).toEqual([
			{
				email: "alvaro@example.com",
				name: "Alvaro",
				participantId: "participant_alvaro",
				shareAmountMinor: 3_334,
			},
			{
				email: "camila@example.com",
				name: "Camila",
				participantId: "participant_camila",
				shareAmountMinor: 3_334,
			},
		]);
	});
});
