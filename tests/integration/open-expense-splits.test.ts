import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateOpenShareAmount, updateShareStatus } from "@/lib/db/expense-shares";
import { createExpense, findExpenseById, listExpenses, updateExpense } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-11T15:00:00.000Z");

describe("custom and open expense splits", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database.batch([
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, 'user', ?, ?)",
				)
				.bind(
					"user_alvaro",
					"alvaro",
					"Alvaro",
					"participant_alvaro",
					NOW.toISOString(),
					NOW.toISOString(),
				),
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, 'user', ?, ?)",
				)
				.bind(
					"user_camila",
					"camila",
					"Camila",
					"participant_camila",
					NOW.toISOString(),
					NOW.toISOString(),
				),
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, 'user', ?, ?)",
				)
				.bind(
					"user_trinidad",
					"trinidad",
					"Trinidad",
					"participant_trinidad",
					NOW.toISOString(),
					NOW.toISOString(),
				),
		]);
	});

	afterEach(async () => bindings.dispose());

	it("stores exact custom allocations without redistributing them", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Compra personalizada",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				shareAllocations: [
					{ participantId: "participant_alvaro", shareAmountMinor: 7_000 },
					{ participantId: "participant_camila", shareAmountMinor: 3_000 },
					{ participantId: "participant_trinidad", shareAmountMinor: 0 },
				],
				splitMode: "custom",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		expect(created.ok).toBe(true);
		if (created.err) return;
		expect(created.val.splitMode).toBe("custom");
		expect(created.val.shares.map((share) => share.shareAmountMinor)).toEqual([7_000, 3_000, 0]);
	});

	it("stores custom recipient shares for an external payer without synthesizing a payer share", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Compra personalizada para otras personas",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_camila", "participant_trinidad"],
				shareAllocations: [
					{ participantId: "participant_camila", shareAmountMinor: 7_000 },
					{ participantId: "participant_trinidad", shareAmountMinor: 3_000 },
				],
				splitMode: "custom",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);

		expect(created.ok).toBe(true);
		if (created.err) return;
		expect(created.val.shares.map((share) => share.participant.id)).toEqual([
			"participant_camila",
			"participant_trinidad",
		]);
		expect(created.val.shares.map((share) => share.shareAmountMinor)).toEqual([7_000, 3_000]);
		expect(created.val.shares.every((share) => share.status === "pending")).toBe(true);
		expect(
			created.val.shares.every((share) => share.paidToParticipantId === "participant_alvaro"),
		).toBe(true);
	});

	it("rejects an open split when the payer has no share even if persistence is called directly", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Cuenta abierta inválida",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_camila", "participant_trinidad"],
				shareAllocations: [
					{ participantId: "participant_camila", shareAmountMinor: 7_000 },
					{ participantId: "participant_trinidad", shareAmountMinor: 3_000 },
				],
				splitMode: "open",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);

		expect(created.err).toBe(true);
		expect(
			await bindings.database.prepare("SELECT COUNT(*) AS count FROM expenses").first(),
		).toMatchObject({ count: 0 });
	});

	it("keeps open allocations exact while owners and admins update pending shares", async () => {
		const created = await createExpense(
			{
				amountMinor: 10_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				initialPaidParticipantIds: ["participant_camila"],
				kindId: "kind-other",
				name: "Cuenta abierta",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				shareAllocations: [
					{ participantId: "participant_alvaro", shareAmountMinor: 4_000 },
					{ participantId: "participant_camila", shareAmountMinor: 5_000 },
					{ participantId: "participant_trinidad", shareAmountMinor: 1_000 },
				],
				splitMode: "open",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw created.val;
		expect(created.val.shares.map((share) => share.status)).toEqual(["settled", "paid", "pending"]);

		const camilaShare = created.val.shares[1];
		const trinidadShare = created.val.shares[2];
		const locked = await updateOpenShareAmount(
			camilaShare.id,
			4_000,
			{ id: "user_camila", participantId: "participant_camila", role: "user" },
			bindings.database,
			NOW,
		);
		expect(locked.ok && locked.val.kind).toBe("paid_locked");

		const forbidden = await updateOpenShareAmount(
			trinidadShare.id,
			2_000,
			{ id: "user_camila", participantId: "participant_camila", role: "user" },
			bindings.database,
			NOW,
		);
		expect(forbidden.ok && forbidden.val.kind).toBe("forbidden");

		const updated = await updateOpenShareAmount(
			trinidadShare.id,
			3_000,
			{ id: "user_trinidad", participantId: "participant_trinidad", role: "user" },
			bindings.database,
			NOW,
		);
		expect(updated.ok && updated.val.kind).toBe("updated");
		if (updated.err || updated.val.kind !== "updated") return;
		expect(updated.val.shares.map((share) => share.shareAmountMinor)).toEqual([
			2_000, 5_000, 3_000,
		]);
		expect(updated.val.shares.reduce((sum, share) => sum + share.shareAmountMinor, 0)).toBe(10_000);

		const excessive = await updateOpenShareAmount(
			trinidadShare.id,
			5_001,
			{ id: "user_trinidad", participantId: "participant_trinidad", role: "user" },
			bindings.database,
			NOW,
		);
		expect(excessive.ok && excessive.val.kind).toBe("amount_exceeds_total");

		const zeroed = await updateOpenShareAmount(
			trinidadShare.id,
			0,
			{ id: "admin", participantId: null, role: "admin" },
			bindings.database,
			NOW,
		);
		expect(zeroed.ok && zeroed.val.kind).toBe("updated");
		if (zeroed.err || zeroed.val.kind !== "updated") return;
		expect(zeroed.val.shares.map((share) => share.shareAmountMinor)).toEqual([5_000, 5_000, 0]);

		const cannotPayZero = await updateShareStatus(
			trinidadShare.id,
			"paid",
			{ id: "user_trinidad", participantId: "participant_trinidad", role: "user" },
			bindings.database,
			NOW,
		);
		expect(cannotPayZero.ok && cannotPayZero.val.kind).toBe("zero_amount");

		const pendingMine = await listExpenses(
			{ pending: "mine" },
			{ currentParticipantId: "participant_trinidad", database: bindings.database },
		);
		expect(pendingMine.ok && pendingMine.val.total).toBe(0);
	});

	it.each(["missing", "not settled"] as const)(
		"does not mutate an open share when its payer share is %s",
		async (corruption) => {
			const created = await createExpense(
				{
					amountMinor: 10_000,
					currency: "CLP",
					expenseDate: "2026-07-11",
					kindId: "kind-other",
					name: "Cuenta abierta corrupta",
					paidByParticipantId: "participant_alvaro",
					participantIds: ["participant_alvaro", "participant_camila"],
					shareAllocations: [
						{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
						{ participantId: "participant_camila", shareAmountMinor: 4_000 },
					],
					splitMode: "open",
				},
				"user_alvaro",
				bindings.database,
				NOW,
			);
			if (created.err) throw created.val;
			const [payerShare, camilaShare] = created.val.shares;
			if (corruption === "missing") {
				await bindings.database
					.prepare("DELETE FROM expense_shares WHERE id = ?")
					.bind(payerShare.id)
					.run();
			} else {
				await bindings.database
					.prepare(
						"UPDATE expense_shares SET status = 'pending', paid_to_participant_id = ? WHERE id = ?",
					)
					.bind("participant_camila", payerShare.id)
					.run();
			}

			const result = await updateOpenShareAmount(
				camilaShare.id,
				5_000,
				{ id: "user_camila", participantId: "participant_camila", role: "user" },
				bindings.database,
				new Date("2026-07-11T16:00:00.000Z"),
			);
			expect(result.err).toBe(true);
			expect(
				await bindings.database
					.prepare("SELECT share_amount_minor FROM expense_shares WHERE id = ?")
					.bind(camilaShare.id)
					.first(),
			).toMatchObject({ share_amount_minor: 4_000 });
			expect(
				await bindings.database
					.prepare("SELECT updated_at FROM expenses WHERE id = ?")
					.bind(created.val.id)
					.first(),
			).toMatchObject({ updated_at: NOW.toISOString() });
		},
	);

	it("allows only root or admin to make structural edits to an existing open expense", async () => {
		const input = {
			amountMinor: 9_000,
			currency: "CLP" as const,
			expenseDate: "2026-07-11",
			kindId: "kind-other",
			name: "Abierta",
			paidByParticipantId: "participant_alvaro",
			participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 3_000 },
				{ participantId: "participant_camila", shareAmountMinor: 3_000 },
				{ participantId: "participant_trinidad", shareAmountMinor: 3_000 },
			],
			splitMode: "open" as const,
		};
		const created = await createExpense(input, "user_alvaro", bindings.database, NOW);
		if (created.err) throw created.val;
		const changed = {
			...input,
			amountMinor: 10_000,
			resetPaidReimbursements: false,
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 4_000 },
				{ participantId: "participant_camila", shareAmountMinor: 3_000 },
				{ participantId: "participant_trinidad", shareAmountMinor: 3_000 },
			],
		};
		const forbidden = await updateExpense(created.val.id, changed, bindings.database, NOW, {
			role: "user",
		});
		expect(forbidden.ok && forbidden.val.kind).toBe("forbidden");
		const allowed = await updateExpense(created.val.id, changed, bindings.database, NOW, {
			role: "admin",
		});
		expect(allowed.ok && allowed.val.kind).toBe("updated");
	});

	it("serializes concurrent owner updates without drifting from the expense total", async () => {
		const created = await createExpense(
			{
				amountMinor: 12_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Abierta concurrente",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				shareAllocations: [
					{ participantId: "participant_alvaro", shareAmountMinor: 4_000 },
					{ participantId: "participant_camila", shareAmountMinor: 4_000 },
					{ participantId: "participant_trinidad", shareAmountMinor: 4_000 },
				],
				splitMode: "open",
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw created.val;
		const [, camila, trinidad] = created.val.shares;
		const results = await Promise.all([
			updateOpenShareAmount(
				camila.id,
				5_000,
				{ id: "user_camila", participantId: "participant_camila", role: "user" },
				bindings.database,
				NOW,
			),
			updateOpenShareAmount(
				trinidad.id,
				3_000,
				{ id: "user_trinidad", participantId: "participant_trinidad", role: "user" },
				bindings.database,
				NOW,
			),
		]);
		expect(results.every((result) => result.ok && result.val.kind === "updated")).toBe(true);
		const stored = await findExpenseById(created.val.id, bindings.database);
		if (stored.err || !stored.val) throw new Error("Concurrent expense could not be read.");
		expect(stored.val.shares.map((share) => share.shareAmountMinor)).toEqual([4_000, 5_000, 3_000]);
		expect(stored.val.shares.reduce((sum, share) => sum + share.shareAmountMinor, 0)).toBe(12_000);
	});
});
