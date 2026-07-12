import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import { createId } from "@/lib/util/ids";

export type McpIdempotencyReservation =
	{ kind: "reserved" } | { expenseId: string | null; kind: "existing" } | { kind: "conflict" };

interface ReservationInput {
	idempotencyKey: string;
	requestHash: string;
	toolName: string;
	userId: string;
}

export async function reserveMcpIdempotencyRecord(
	input: ReservationInput,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<McpIdempotencyReservation, DbError>> {
	return safeDbCall(async () => {
		const inserted = await database
			.prepare(
				`INSERT INTO mcp_idempotency_records
				 (id, user_id, tool_name, idempotency_key, request_hash, expense_id, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
				 ON CONFLICT(user_id, tool_name, idempotency_key) DO NOTHING`,
			)
			.bind(
				createId(),
				input.userId,
				input.toolName,
				input.idempotencyKey,
				input.requestHash,
				now.toISOString(),
				new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
			)
			.run();
		if (inserted.meta.changes === 1) return { kind: "reserved" };
		const existing = await database
			.prepare(
				`SELECT request_hash, expense_id FROM mcp_idempotency_records
				 WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?`,
			)
			.bind(input.userId, input.toolName, input.idempotencyKey)
			.first<{ expense_id: string | null; request_hash: string }>();
		if (!existing) throw new Error("Idempotency reservation disappeared.");
		if (existing.request_hash !== input.requestHash) return { kind: "conflict" };
		return { expenseId: existing.expense_id, kind: "existing" };
	});
}

export async function completeMcpIdempotencyRecord(
	input: ReservationInput & { expenseId: string },
	database: D1Database = getDatabase(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const updated = await database
			.prepare(
				`UPDATE mcp_idempotency_records SET expense_id = ?
				 WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?
				   AND request_hash = ? AND expense_id IS NULL`,
			)
			.bind(input.expenseId, input.userId, input.toolName, input.idempotencyKey, input.requestHash)
			.run();
		return updated.meta.changes === 1;
	});
}

export async function releaseMcpIdempotencyReservation(
	input: ReservationInput,
	database: D1Database = getDatabase(),
): Promise<Result<void, DbError>> {
	return safeDbCall(async () => {
		await database
			.prepare(
				`DELETE FROM mcp_idempotency_records
				 WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?
				   AND request_hash = ? AND expense_id IS NULL`,
			)
			.bind(input.userId, input.toolName, input.idempotencyKey, input.requestHash)
			.run();
	});
}
