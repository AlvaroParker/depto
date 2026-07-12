import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	database: null as D1Database | null,
	receipts: null as R2Bucket | null,
}));

vi.mock("@/lib/db/bindings", () => ({
	getBindings: () => ({
		APP_BASE_URL: "https://expenses.example",
		DB: state.database,
		RECEIPTS: state.receipts,
		RESEND_API_KEY: "",
		RESEND_FROM_EMAIL: "",
	}),
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import { createExpense } from "@/lib/db/expenses";
import { getDashboardSummary } from "@/lib/db/dashboard";
import { payAllActorDebt } from "@/lib/services/bulk-payments";
import { setActorPaymentStatus } from "@/lib/services/reimbursements";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-12T15:00:00.000Z");
const ALVARO_ACTOR = {
	participantId: "participant_alvaro",
	role: "user" as const,
	userId: "user_alvaro",
};

describe("bulk payments", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.receipts = bindings.receipts;
		await bindings.database.batch(
			[
				["user_alvaro", "alvaro", "Alvaro", "participant_alvaro"],
				["user_camila", "camila", "Camila", "participant_camila"],
				["user_trinidad", "trinidad", "Trinidad", "participant_trinidad"],
			].map(([id, username, displayName, participantId]) =>
				bindings.database
					.prepare(
						`INSERT INTO app_users
						 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
						 VALUES (?, ?, 'hash', ?, ?, 'user', ?, ?)`,
					)
					.bind(id, username, displayName, participantId, NOW.toISOString(), NOW.toISOString()),
			),
		);
	});

	afterEach(async () => {
		state.database = null;
		state.receipts = null;
		await bindings.dispose();
	});

	async function expense(
		name: string,
		amountMinor: number,
		payer: "participant_alvaro" | "participant_camila" | "participant_trinidad",
		participants: string[],
	) {
		const created = await createExpense(
			{
				amountMinor,
				currency: "CLP",
				expenseDate: "2026-07-12",
				kindId: "kind-other",
				name,
				paidByParticipantId: payer,
				participantIds: participants,
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw created.val;
		return created.val;
	}

	it("pays only the actor's outgoing shares to one participant", async () => {
		await expense("Internet", 6_000, "participant_camila", [
			"participant_alvaro",
			"participant_camila",
		]);
		await expense("Agua", 10_000, "participant_camila", [
			"participant_alvaro",
			"participant_camila",
		]);
		await expense("Gas", 4_000, "participant_trinidad", [
			"participant_alvaro",
			"participant_trinidad",
		]);
		await expense("Compra inversa", 2_000, "participant_alvaro", [
			"participant_alvaro",
			"participant_camila",
		]);

		const result = await payAllActorDebt("participant_camila", null, ALVARO_ACTOR);
		expect(result.ok && result.val).toMatchObject({
			kind: "updated",
			payment: { amountPaidMinor: 8_000, paidExpenseCount: 2, proofAttached: false },
		});

		const dashboard = await getDashboardSummary({
			currentParticipantId: "participant_alvaro",
			database: bindings.database,
		});
		if (dashboard.err || dashboard.val.view !== "personal") throw new Error("Missing dashboard");
		expect(
			dashboard.val.debtsByParticipant.map((debt) => [
				debt.participant.name,
				debt.amountOwedMinor,
				debt.amountDueToMeMinor,
			]),
		).toEqual([
			["Trinidad", 2_000, 0],
			["Camila", 0, 1_000],
		]);
	});

	it("stores one proof object and keeps it until its final share association is removed", async () => {
		const first = await expense("Internet", 6_000, "participant_camila", [
			"participant_alvaro",
			"participant_camila",
		]);
		const second = await expense("Agua", 10_000, "participant_camila", [
			"participant_alvaro",
			"participant_camila",
		]);
		const result = await payAllActorDebt(
			"participant_camila",
			{
				bytes: new TextEncoder().encode("proof"),
				contentType: "image/png",
				filename: "transferencia.png",
			},
			ALVARO_ACTOR,
		);
		expect(result.ok && result.val.kind).toBe("updated");

		const proofs = await bindings.database
			.prepare("SELECT share_id, object_key FROM expense_share_payment_proofs ORDER BY share_id")
			.all<{ object_key: string; share_id: string }>();
		expect(proofs.results).toHaveLength(2);
		expect(new Set(proofs.results.map((proof) => proof.object_key)).size).toBe(1);
		const objectKey = proofs.results[0].object_key;
		expect(await bindings.receipts.get(objectKey)).not.toBeNull();

		await setActorPaymentStatus(first.id, "pending", ALVARO_ACTOR);
		expect(await bindings.receipts.get(objectKey)).not.toBeNull();
		await setActorPaymentStatus(second.id, "pending", ALVARO_ACTOR);
		expect(await bindings.receipts.get(objectKey)).toBeNull();
	});

	it("allows only one concurrent submission to affect the pending set", async () => {
		await expense("Internet", 6_000, "participant_camila", [
			"participant_alvaro",
			"participant_camila",
		]);
		const results = await Promise.all([
			payAllActorDebt("participant_camila", null, ALVARO_ACTOR),
			payAllActorDebt("participant_camila", null, ALVARO_ACTOR),
		]);
		expect(results.map((result) => (result.ok ? result.val.kind : result.val.kind)).sort()).toEqual(
			["no_debt", "updated"],
		);
	});
});
