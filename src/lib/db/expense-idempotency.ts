import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import { createId } from "@/lib/util/ids";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

export interface ExpenseIdempotencyInput {
	idempotencyKey: string;
	requestHash: string;
	toolName: string;
	userId: string;
}

export interface ExpenseIdempotencyRecord {
	expenseId: string | null;
	requestHash: string;
}

interface ExpenseIdempotencyRow {
	expense_id: string | null;
	request_hash: string;
}

export async function readExpenseIdempotencyRecord(
	input: Pick<ExpenseIdempotencyInput, "idempotencyKey" | "toolName" | "userId">,
	database: D1Database,
): Promise<ExpenseIdempotencyRecord | null> {
	const row = await database
		.prepare(
			`SELECT request_hash, expense_id
			 FROM mcp_idempotency_records
			 WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?`,
		)
		.bind(input.userId, input.toolName, input.idempotencyKey)
		.first<ExpenseIdempotencyRow>();
	return row ? { expenseId: row.expense_id, requestHash: row.request_hash } : null;
}

export async function findExpenseIdempotencyRecord(
	input: Pick<ExpenseIdempotencyInput, "idempotencyKey" | "toolName" | "userId">,
	database: D1Database = getDatabase(),
): Promise<Result<ExpenseIdempotencyRecord | null, DbError>> {
	return safeDbCall(() => readExpenseIdempotencyRecord(input, database));
}

export function prepareCompletedExpenseIdempotencyRecord(
	database: D1Database,
	input: ExpenseIdempotencyInput,
	expenseId: string,
	now: Date,
): D1PreparedStatement {
	return database
		.prepare(
			`INSERT INTO mcp_idempotency_records
			 (id, user_id, tool_name, idempotency_key, request_hash, expense_id, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			createId(),
			input.userId,
			input.toolName,
			input.idempotencyKey,
			input.requestHash,
			expenseId,
			now.toISOString(),
			new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
		);
}
