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
import { findExpenseReceipt } from "@/lib/db/receipts";
import { findShareByExpenseAndParticipant } from "@/lib/db/expense-shares";
import { acquireMcpFile } from "@/lib/mcp/files";
import { attachActorPaymentProof, attachMcpReceipt } from "@/lib/services/files";
import type { OAuthActor } from "@/lib/types/actor";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("MCP private file services", () => {
	let bindings: TestBindings;
	let expenseId: string;
	const actor: OAuthActor = {
		clientId: "client",
		displayName: "Camila",
		grantId: "grant",
		participantId: "participant_camila",
		role: "user",
		scopes: new Set(["expenses:write", "reimbursements:write"]),
		source: "oauth",
		userId: "mcp-file-user",
		username: "camila",
	};

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.receipts = bindings.receipts;
		const timestamp = "2026-07-12T12:00:00.000Z";
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('mcp-file-user', 'mcp-file-user', 'hash', 'Camila',
				 'participant_camila', 'user', ?, ?)`,
			)
			.bind(timestamp, timestamp)
			.run();
		const expense = await createExpense(
			{
				amountMinor: 3000,
				currency: "CLP",
				description: null,
				expenseDate: "2026-07-12",
				kindId: "kind-other",
				name: "MCP files",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro", "participant_camila"],
				splitMode: "equal",
			},
			"mcp-file-user",
			bindings.database,
		);
		if (expense.err) throw expense.val;
		expenseId = expense.val.id;
	});

	afterEach(async () => {
		state.database = null;
		state.receipts = null;
		await bindings.dispose();
	});

	it("attaches and replaces receipts while cleaning the previous private object", async () => {
		const first = await acquireMcpFile(
			{ base64: btoa("first"), filename: "first.png", mimeType: "image/png" },
			new Set(["image/png"]),
		);
		expect(await attachMcpReceipt(expenseId, first)).toBe(true);
		const firstMetadata = await findExpenseReceipt(expenseId, bindings.database);
		if (firstMetadata.err || !firstMetadata.val) throw new Error("Missing first receipt");
		expect(await bindings.receipts.get(firstMetadata.val.objectKey)).not.toBeNull();

		const second = await acquireMcpFile(
			{ base64: btoa("second"), filename: "second.png", mimeType: "image/png" },
			new Set(["image/png"]),
		);
		expect(await attachMcpReceipt(expenseId, second)).toBe(true);
		const secondMetadata = await findExpenseReceipt(expenseId, bindings.database);
		if (secondMetadata.err || !secondMetadata.val) throw new Error("Missing second receipt");
		expect(secondMetadata.val.filename).toBe("second.png");
		expect(secondMetadata.val.objectKey).not.toBe(firstMetadata.val.objectKey);
		expect(await bindings.receipts.get(firstMetadata.val.objectKey)).toBeNull();
	});

	it("atomically marks the caller share paid with safe proof metadata", async () => {
		const proof = await acquireMcpFile(
			{ base64: btoa("proof"), filename: "proof.webp", mimeType: "image/webp" },
			new Set(["image/webp"]),
		);
		const updated = await attachActorPaymentProof(expenseId, proof, actor);
		expect(updated).toMatchObject({
			participant: { id: "participant_camila" },
			paymentProof: { contentType: "image/webp", filename: "proof.webp" },
			status: "paid",
		});
		const stored = await findShareByExpenseAndParticipant(
			expenseId,
			"participant_camila",
			bindings.database,
		);
		if (stored.err) throw stored.val;
		expect(stored.val?.status).toBe("paid");
	});
});
