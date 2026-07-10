import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachExpenseReceipt, findExpenseReceipt } from "@/lib/db/receipts";
import { createExpense } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T19:00:00.000Z");

describe("private receipt persistence", () => {
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

	it("stores the body in R2 and associates only opaque metadata in D1", async () => {
		const expense = await createExpense(
			{
				amountMinor: 3000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				name: "Boleta",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (expense.err) throw new Error("fixture failed");
		const objectKey = `receipts/${expense.val.id}/opaque.pdf`;
		await bindings.receipts.put(objectKey, new TextEncoder().encode("private-pdf"), {
			httpMetadata: { contentType: "application/pdf" },
		});
		const attached = await attachExpenseReceipt(
			expense.val.id,
			{ contentType: "application/pdf", filename: "boleta.pdf", objectKey, sizeBytes: 11 },
			bindings.database,
			NOW,
		);
		expect(attached.ok && attached.val.attached).toBe(true);
		const metadata = await findExpenseReceipt(expense.val.id, bindings.database);
		expect(metadata.ok && metadata.val).toMatchObject({ filename: "boleta.pdf", objectKey });
		const stored = await bindings.receipts.get(objectKey);
		expect(await stored?.text()).toBe("private-pdf");
	});

	it("does not associate metadata with an unknown expense", async () => {
		const result = await attachExpenseReceipt(
			"missing",
			{ contentType: "image/png", filename: "x.png", objectKey: "receipts/x.png", sizeBytes: 1 },
			bindings.database,
			NOW,
		);
		expect(result.ok && result.val.attached).toBe(false);
	});
});
