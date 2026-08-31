import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createExpense,
	findExpenseById,
	listExpenses,
	softDeleteExpense,
	updateExpense,
} from "@/lib/db/expenses";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { findAvailablePayersForExpense, findParticipantsForExpense } from "@/lib/db/participants";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T20:00:00.000Z");

describe("expense corrections", () => {
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

	it("preserves paid state for descriptive edits and requires confirmation for financial edits", async () => {
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
		if (created.err) throw new Error("fixture failed");
		await updateShareStatus(
			created.val.shares[1].id,
			"paid",
			{ id: "user_alvaro", participantId: "participant_alvaro", role: "admin" },
			bindings.database,
			NOW,
		);
		const descriptive = await updateExpense(
			created.val.id,
			{
				amountMinor: 9_000,
				currency: "CLP",
				kindId: "kind-gas",
				description: "Julio",
				expenseDate: "2026-07-08",
				name: "Gas de casa",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				resetPaidReimbursements: false,
			},
			bindings.database,
			NOW,
		);
		expect(descriptive.ok && descriptive.val.kind).toBe("updated");
		if (descriptive.err || descriptive.val.kind !== "updated") return;
		expect(descriptive.val.expense.shares[1].status).toBe("paid");
		expect(descriptive.val.expense.kind.name).toBe("Gas");

		const conflict = await updateExpense(
			created.val.id,
			{
				amountMinor: 10_000,
				currency: "CLP",
				kindId: "kind-other",
				description: "Julio",
				expenseDate: "2026-07-08",
				name: "Gas de casa",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				resetPaidReimbursements: false,
			},
			bindings.database,
			NOW,
		);
		expect(conflict.ok && conflict.val.kind).toBe("paid_reset_required");
		const unchanged = await findExpenseById(created.val.id, bindings.database);
		expect(unchanged.ok && unchanged.val?.amountMinor).toBe(9_000);

		const confirmed = await updateExpense(
			created.val.id,
			{
				amountMinor: 10_000,
				currency: "CLP",
				kindId: "kind-other",
				description: "Julio",
				expenseDate: "2026-07-08",
				name: "Gas de casa",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				resetPaidReimbursements: true,
			},
			bindings.database,
			NOW,
		);
		expect(confirmed.ok && confirmed.val.kind).toBe("updated");
		if (confirmed.err || confirmed.val.kind !== "updated") return;
		expect(confirmed.val.expense.shares.map((share) => share.shareAmountMinor)).toEqual([
			3334, 3333, 3333,
		]);
		expect(confirmed.val.expense.shares.map((share) => share.status)).toEqual([
			"pending",
			"settled",
			"pending",
		]);
	});

	it("soft deletes without removing the row or receipt metadata", async () => {
		const created = await createExpense(
			{
				amountMinor: 3_000,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-07-09",
				name: "Pan",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw new Error("fixture failed");
		await bindings.database
			.prepare(
				"UPDATE expenses SET receipt_object_key = ?, receipt_filename = ?, receipt_content_type = ?, receipt_size_bytes = ? WHERE id = ?",
			)
			.bind("receipts/a.pdf", "a.pdf", "application/pdf", 10, created.val.id)
			.run();
		expect((await softDeleteExpense(created.val.id, bindings.database, NOW)).val).toBe(true);
		const page = await listExpenses({}, { database: bindings.database });
		expect(page.ok).toBe(true);
		if (page.err) return;
		expect(page.val.total).toBe(0);
		expect((await findExpenseById(created.val.id, bindings.database)).val).toBeNull();
		const retained = await bindings.database
			.prepare("SELECT deleted_at, receipt_object_key FROM expenses WHERE id = ?")
			.bind(created.val.id)
			.first<{ deleted_at: string; receipt_object_key: string }>();
		expect(retained).toMatchObject({
			deleted_at: NOW.toISOString(),
			receipt_object_key: "receipts/a.pdf",
		});
	});

	it("moves an equal expense to an active payer outside the share recipients", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				kindId: "kind-other",
				name: "Compra original",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw new Error("fixture failed");

		const updated = await updateExpense(
			created.val.id,
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				kindId: "kind-other",
				name: "Compra corregida",
				paidByParticipantId: "participant_trinidad",
				participantIds: ["participant_alvaro", "participant_camila"],
				resetPaidReimbursements: false,
				splitMode: "equal",
			},
			bindings.database,
			NOW,
		);

		expect(updated.ok && updated.val.kind).toBe("updated");
		if (updated.err || updated.val.kind !== "updated") return;
		expect(updated.val.expense.payer.id).toBe("participant_trinidad");
		expect(updated.val.expense.shares.map((share) => share.participant.id)).toEqual([
			"participant_alvaro",
			"participant_camila",
		]);
		expect(updated.val.expense.shares.map((share) => share.status)).toEqual(["pending", "pending"]);
		expect(updated.val.expense.shares.map((share) => share.paidToParticipantId)).toEqual([
			"participant_trinidad",
			"participant_trinidad",
		]);
	});

	it("keeps an inactive current external payer editable but excludes inactive former recipients as payers", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				kindId: "kind-other",
				name: "Compra histórica",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw new Error("fixture failed");
		await bindings.database
			.prepare("UPDATE participants SET active = 0 WHERE id IN (?, ?)")
			.bind("participant_alvaro", "participant_camila")
			.run();

		const recipients = await findParticipantsForExpense(created.val.id, bindings.database);
		const payers = await findAvailablePayersForExpense(created.val.id, bindings.database);
		expect(recipients.ok && recipients.val.map((participant) => participant.id)).toEqual([
			"participant_camila",
			"participant_trinidad",
		]);
		expect(payers.ok && payers.val.map((participant) => participant.id)).toEqual([
			"participant_alvaro",
			"participant_trinidad",
		]);

		const descriptive = await updateExpense(
			created.val.id,
			{
				amountMinor: 10_000,
				currency: "CLP",
				description: "Conserva el pagador histórico",
				expenseDate: "2026-07-09",
				kindId: "kind-other",
				name: "Compra histórica corregida",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_camila", "participant_trinidad"],
				resetPaidReimbursements: false,
				splitMode: "equal",
			},
			bindings.database,
			NOW,
		);
		expect(descriptive.ok && descriptive.val.kind).toBe("updated");

		const invalidPayer = await updateExpense(
			created.val.id,
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-09",
				kindId: "kind-other",
				name: "Pagador inactivo inválido",
				paidByParticipantId: "participant_camila",
				participantIds: ["participant_camila", "participant_trinidad"],
				resetPaidReimbursements: false,
				splitMode: "equal",
			},
			bindings.database,
			NOW,
		);
		expect(invalidPayer.err).toBe(true);
	});
});
