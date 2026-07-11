import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense, softDeleteExpense, updateExpense } from "@/lib/db/expenses";
import {
	attachSharePaymentProof,
	findSharePaymentProof,
	type ShareMutationActor,
	updateShareStatus,
} from "@/lib/db/expense-shares";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-11T14:00:00.000Z");
const OWNER: ShareMutationActor = {
	id: "user_camila",
	participantId: "participant_camila",
	role: "user",
};
const OTHER_USER: ShareMutationActor = {
	id: "user_trinidad",
	participantId: "participant_trinidad",
	role: "user",
};
const ADMIN: ShareMutationActor = { id: "user_admin", participantId: null, role: "admin" };

describe("share payment proofs", () => {
	let bindings: TestBindings;
	let debtorShareId: string;
	let expenseId: string;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database.batch(
			[
				["user_alvaro", "alvaro", "Alvaro", "participant_alvaro", "user"],
				["user_camila", "camila", "Camila", "participant_camila", "user"],
				["user_trinidad", "trinidad", "Trinidad", "participant_trinidad", "user"],
				["user_admin", "admin", "Admin", null, "admin"],
			].map(([id, username, displayName, participantId, role]) =>
				bindings.database
					.prepare(
						"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, ?, ?, ?)",
					)
					.bind(
						id,
						username,
						displayName,
						participantId,
						role,
						NOW.toISOString(),
						NOW.toISOString(),
					),
			),
		);
		const created = await createExpense(
			{
				amountMinor: 9_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Internet",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			},
			"user_alvaro",
			bindings.database,
			NOW,
		);
		if (created.err) throw created.val;
		expenseId = created.val.id;
		debtorShareId = created.val.shares.find(
			(share) => share.participant.id === "participant_camila",
		)!.id;
	});

	afterEach(async () => bindings.dispose());

	it("allows the owner to mark paid with proof and replace it without changing payment audit", async () => {
		const first = await attachSharePaymentProof(
			debtorShareId,
			{
				contentType: "image/png",
				filename: "primera.png",
				objectKey: "payment-proofs/first.png",
				sizeBytes: 10,
			},
			OWNER,
			bindings.database,
			NOW,
		);
		expect(first.ok && first.val.kind).toBe("updated");
		if (first.err || first.val.kind !== "updated") return;
		expect(first.val.previousObjectKey).toBeNull();
		expect(first.val.share).toMatchObject({
			markedByUserId: OWNER.id,
			paidAt: NOW.toISOString(),
			paymentProof: {
				filename: "primera.png",
				uploadedAt: NOW.toISOString(),
				uploadedByUserId: OWNER.id,
			},
			status: "paid",
		});

		const replacedAt = new Date(NOW.getTime() + 1_000);
		const replacement = await attachSharePaymentProof(
			debtorShareId,
			{
				contentType: "image/jpeg",
				filename: "segunda.jpg",
				objectKey: "payment-proofs/second.jpg",
				sizeBytes: 20,
			},
			OWNER,
			bindings.database,
			replacedAt,
		);
		expect(replacement.ok && replacement.val.kind).toBe("updated");
		if (replacement.err || replacement.val.kind !== "updated") return;
		expect(replacement.val.previousObjectKey).toBe("payment-proofs/first.png");
		expect(replacement.val.share.paidAt).toBe(NOW.toISOString());
		expect(replacement.val.share.markedByUserId).toBe(OWNER.id);
		expect(replacement.val.share.paymentProof?.filename).toBe("segunda.jpg");
	});

	it("enforces owner or admin mutation rights and supports optional proofless payment", async () => {
		const forbidden = await updateShareStatus(
			debtorShareId,
			"paid",
			OTHER_USER,
			bindings.database,
			NOW,
		);
		expect(forbidden.ok && forbidden.val.kind).toBe("forbidden");

		const paid = await updateShareStatus(debtorShareId, "paid", ADMIN, bindings.database, NOW);
		expect(paid.ok && paid.val.kind).toBe("updated");
		if (paid.err || paid.val.kind !== "updated") return;
		expect(paid.val.share.paymentProof).toBeNull();
		expect(paid.val.share.markedByUserId).toBe(ADMIN.id);
	});

	it("removes proof metadata on reversion and returns the displaced object key", async () => {
		const attached = await attachSharePaymentProof(
			debtorShareId,
			{
				contentType: "image/webp",
				filename: "pago.webp",
				objectKey: "payment-proofs/current.webp",
				sizeBytes: 12,
			},
			OWNER,
			bindings.database,
			NOW,
		);
		if (attached.err || attached.val.kind !== "updated") throw new Error("fixture failed");

		const pending = await updateShareStatus(
			debtorShareId,
			"pending",
			OWNER,
			bindings.database,
			new Date(NOW.getTime() + 1_000),
		);
		expect(pending.ok && pending.val.kind).toBe("updated");
		if (pending.err || pending.val.kind !== "updated") return;
		expect(pending.val.removedProofObjectKey).toBe("payment-proofs/current.webp");
		expect(pending.val.share).toMatchObject({
			markedByUserId: null,
			paidAt: null,
			paymentProof: null,
			status: "pending",
		});
		const proof = await findSharePaymentProof(debtorShareId, bindings.database);
		expect(proof.ok && proof.val).toBeNull();
	});

	it("returns displaced proof keys on recalculation and retains proof on soft delete", async () => {
		const attached = await attachSharePaymentProof(
			debtorShareId,
			{
				contentType: "image/png",
				filename: "recalculo.png",
				objectKey: "payment-proofs/recalculation.png",
				sizeBytes: 14,
			},
			OWNER,
			bindings.database,
			NOW,
		);
		if (attached.err || attached.val.kind !== "updated") throw new Error("fixture failed");

		const recalculated = await updateExpense(
			expenseId,
			{
				amountMinor: 12_000,
				currency: "CLP",
				expenseDate: "2026-07-11",
				kindId: "kind-other",
				name: "Internet",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
				resetPaidReimbursements: true,
			},
			bindings.database,
			NOW,
		);
		expect(recalculated.ok && recalculated.val.kind).toBe("updated");
		if (recalculated.err || recalculated.val.kind !== "updated") return;
		expect(recalculated.val.removedPaymentProofObjectKeys).toEqual([
			"payment-proofs/recalculation.png",
		]);
		expect(
			await bindings.database
				.prepare("SELECT COUNT(*) AS total FROM expense_share_payment_proofs")
				.first<{ total: number }>(),
		).toEqual({ total: 0 });

		const newCamilaShare = recalculated.val.expense.shares.find(
			(share) => share.participant.id === "participant_camila",
		)!;
		const retained = await attachSharePaymentProof(
			newCamilaShare.id,
			{
				contentType: "image/webp",
				filename: "auditoria.webp",
				objectKey: "payment-proofs/audit.webp",
				sizeBytes: 15,
			},
			OWNER,
			bindings.database,
			NOW,
		);
		if (retained.err || retained.val.kind !== "updated") throw new Error("fixture failed");
		expect((await softDeleteExpense(expenseId, bindings.database, NOW)).val).toBe(true);
		expect((await findSharePaymentProof(newCamilaShare.id, bindings.database)).val).toBeNull();
		expect(
			await bindings.database
				.prepare("SELECT object_key FROM expense_share_payment_proofs WHERE share_id = ?")
				.bind(newCamilaShare.id)
				.first<{ object_key: string }>(),
		).toEqual({ object_key: "payment-proofs/audit.webp" });
	});
});
