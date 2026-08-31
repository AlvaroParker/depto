import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createExpenseIdempotently,
	type IdempotentExpenseCreationOutcome,
} from "@/lib/db/expenses";
import { reserveMcpIdempotencyRecord } from "@/lib/db/mcp-idempotency";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const EXPENSE = {
	amountMinor: 12_000,
	currency: "CLP" as const,
	description: "Compra semanal",
	expenseDate: "2026-08-31",
	kindId: "kind-other",
	name: "Supermercado",
	paidByParticipantId: "participant_alvaro",
	participantIds: ["participant_alvaro", "participant_camila"],
	splitMode: "equal" as const,
};
const IDEMPOTENCY = {
	idempotencyKey: "expense-42",
	requestHash: "request-hash",
	toolName: "create_expense",
	userId: "user_alvaro",
};

describe("atomic expense idempotency", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				"user_alvaro",
				"alvaro",
				"test-hash",
				"Alvaro",
				"participant_alvaro",
				NOW.toISOString(),
				NOW.toISOString(),
			)
			.run();
	});

	afterEach(async () => bindings.dispose());

	it("commits the expense, shares, and completed idempotency record in one batch", async () => {
		const result = await createExpenseIdempotently(
			EXPENSE,
			"user_alvaro",
			IDEMPOTENCY,
			bindings.database,
			NOW,
		);
		expect(result.ok && result.val.kind).toBe("created");
		if (result.err || result.val.kind !== "created") return;

		const record = await bindings.database
			.prepare(
				`SELECT request_hash, expense_id
				 FROM mcp_idempotency_records
				 WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?`,
			)
			.bind(IDEMPOTENCY.userId, IDEMPOTENCY.toolName, IDEMPOTENCY.idempotencyKey)
			.first<{ expense_id: string | null; request_hash: string }>();
		expect(record).toEqual({
			expense_id: result.val.expense.id,
			request_hash: IDEMPOTENCY.requestHash,
		});
	});

	it("replays the original expense and rejects a changed request", async () => {
		const created = await createExpenseIdempotently(
			EXPENSE,
			"user_alvaro",
			IDEMPOTENCY,
			bindings.database,
			NOW,
		);
		if (created.err || created.val.kind !== "created") throw new Error("Fixture creation failed.");
		const replay = await createExpenseIdempotently(
			EXPENSE,
			"user_alvaro",
			IDEMPOTENCY,
			bindings.database,
			NOW,
		);
		expect(replay.ok && replay.val).toMatchObject({
			expense: { id: created.val.expense.id },
			kind: "replayed",
		});
		const conflict = await createExpenseIdempotently(
			{ ...EXPENSE, amountMinor: 13_000 },
			"user_alvaro",
			{ ...IDEMPOTENCY, requestHash: "changed-hash" },
			bindings.database,
			NOW,
		);
		expect(conflict.ok && conflict.val).toEqual({ kind: "conflict" });
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});

	it("serializes concurrent creators without creating duplicate expenses", async () => {
		const attempts = await Promise.all(
			[0, 1].map(() =>
				createExpenseIdempotently(EXPENSE, "user_alvaro", IDEMPOTENCY, bindings.database, NOW),
			),
		);
		expect(attempts.every((attempt) => attempt.ok)).toBe(true);
		const outcomes = attempts.map((attempt) => attempt.val as IdempotentExpenseCreationOutcome);
		expect(outcomes.map(({ kind }) => kind)).toEqual(
			expect.arrayContaining(["created", "replayed"]),
		);
		const expenseIds = outcomes.flatMap((outcome) =>
			"expense" in outcome ? [outcome.expense.id] : [],
		);
		expect(new Set(expenseIds).size).toBe(1);
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});

	it("preserves legacy in-progress reservations and rolls back failed creation batches", async () => {
		const reserved = await reserveMcpIdempotencyRecord(IDEMPOTENCY, bindings.database, NOW);
		expect(reserved.ok && reserved.val).toEqual({ kind: "reserved" });
		const inProgress = await createExpenseIdempotently(
			EXPENSE,
			"user_alvaro",
			IDEMPOTENCY,
			bindings.database,
			NOW,
		);
		expect(inProgress.ok && inProgress.val).toEqual({ kind: "in_progress" });

		const failed = await createExpenseIdempotently(
			{ ...EXPENSE, kindId: "missing-kind" },
			"user_alvaro",
			{
				...IDEMPOTENCY,
				idempotencyKey: "failed-batch",
				requestHash: "failed-hash",
			},
			bindings.database,
			NOW,
		);
		expect(failed.err).toBe(true);
		const failedRecord = await bindings.database
			.prepare("SELECT id FROM mcp_idempotency_records WHERE idempotency_key = 'failed-batch'")
			.first();
		expect(failedRecord).toBeNull();
		const expenseCount = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(expenseCount?.count).toBe(0);
	});
});
