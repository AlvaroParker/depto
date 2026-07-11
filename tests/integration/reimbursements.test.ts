import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense } from "@/lib/db/expenses";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T18:00:00.000Z");

describe("reimbursement status", () => {
	let bindings: TestBindings;
	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database.batch(
			[
				["user_alvaro", "alvaro", "Alvaro", "participant_alvaro"],
				["user_camila", "camila", "Camila", "participant_camila"],
			].map(([id, username, displayName, participantId]) =>
				bindings.database
					.prepare(
						"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, ?, ?)",
					)
					.bind(id, username, displayName, participantId, NOW.toISOString(), NOW.toISOString()),
			),
		);
	});
	afterEach(async () => bindings.dispose());

	it("records and clears paid audit fields while keeping the payer immutable", async () => {
		const created = await createExpense(
			{
				amountMinor: 9_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-09",
				name: "Gas",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw created.val;
		const payerShare = created.val.shares[0];
		const debtorShare = created.val.shares[1];

		const immutable = await updateShareStatus(
			payerShare.id,
			"paid",
			{ id: "user_alvaro", participantId: "participant_alvaro", role: "user" },
			bindings.database,
			NOW,
		);
		expect(immutable.ok && immutable.val.kind).toBe("payer_immutable");

		const paid = await updateShareStatus(
			debtorShare.id,
			"paid",
			{ id: "user_camila", participantId: "participant_camila", role: "user" },
			bindings.database,
			NOW,
		);
		expect(paid.ok && paid.val.kind).toBe("updated");
		if (paid.err || paid.val.kind !== "updated") return;
		expect(paid.val.share).toMatchObject({
			markedByUserId: "user_camila",
			paidAt: NOW.toISOString(),
			status: "paid",
		});

		const pending = await updateShareStatus(
			debtorShare.id,
			"pending",
			{ id: "user_camila", participantId: "participant_camila", role: "user" },
			bindings.database,
			new Date(NOW.getTime() + 1000),
		);
		expect(pending.ok && pending.val.kind).toBe("updated");
		if (pending.err || pending.val.kind !== "updated") return;
		expect(pending.val.share).toMatchObject({
			markedByUserId: null,
			paidAt: null,
			status: "pending",
		});
	});
});
