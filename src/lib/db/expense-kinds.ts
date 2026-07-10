import "server-only";

import type { Result } from "ts-results";
import { isExpenseKindIconKey } from "@/lib/const/expense-kinds";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { ExpenseKind, ExpenseKindInput } from "@/lib/types/expense-kind";
import { createId } from "@/lib/util/ids";

interface ExpenseKindRow {
	icon_key: string;
	id: string;
	name: string;
	sort_order: number;
}

export type CreateExpenseKindOutcome =
	{ kind: "created"; expenseKind: ExpenseKind } | { kind: "name_taken" };

export type UpdateExpenseKindOutcome =
	{ kind: "not_found" } | { kind: "name_taken" } | { kind: "updated"; expenseKind: ExpenseKind };

function mapExpenseKind(row: ExpenseKindRow): ExpenseKind {
	if (!isExpenseKindIconKey(row.icon_key)) throw new Error("Unknown expense kind icon key.");
	return {
		iconKey: row.icon_key,
		id: row.id,
		name: row.name,
		sortOrder: row.sort_order,
	};
}

async function findByName(
	database: D1Database,
	name: string,
	excludeId?: string,
): Promise<ExpenseKindRow | null> {
	const query = excludeId
		? "SELECT id, name, icon_key, sort_order FROM expense_kinds WHERE name = ? COLLATE NOCASE AND id <> ?"
		: "SELECT id, name, icon_key, sort_order FROM expense_kinds WHERE name = ? COLLATE NOCASE";
	return database
		.prepare(query)
		.bind(...(excludeId ? [name.trim(), excludeId] : [name.trim()]))
		.first<ExpenseKindRow>();
}

export async function listExpenseKinds(
	database: D1Database = getDatabase(),
): Promise<Result<ExpenseKind[], DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				"SELECT id, name, icon_key, sort_order FROM expense_kinds ORDER BY sort_order, lower(name)",
			)
			.all<ExpenseKindRow>();
		return result.results.map(mapExpenseKind);
	});
}

export async function findExpenseKindById(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<ExpenseKind | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare("SELECT id, name, icon_key, sort_order FROM expense_kinds WHERE id = ?")
			.bind(id)
			.first<ExpenseKindRow>();
		return row ? mapExpenseKind(row) : null;
	});
}

export async function createExpenseKind(
	input: ExpenseKindInput,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<CreateExpenseKindOutcome, DbError>> {
	return safeDbCall(async () => {
		if (await findByName(database, input.name)) return { kind: "name_taken" };
		const id = createId();
		const timestamp = now.toISOString();
		await database
			.prepare(
				`INSERT INTO expense_kinds (id, name, icon_key, sort_order, created_at, updated_at)
				 SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ?, ? FROM expense_kinds`,
			)
			.bind(id, input.name.trim(), input.iconKey, timestamp, timestamp)
			.run();
		const row = await database
			.prepare("SELECT id, name, icon_key, sort_order FROM expense_kinds WHERE id = ?")
			.bind(id)
			.first<ExpenseKindRow>();
		if (!row) throw new Error("Created expense kind could not be read.");
		return { expenseKind: mapExpenseKind(row), kind: "created" };
	});
}

export async function updateExpenseKind(
	id: string,
	input: ExpenseKindInput,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<UpdateExpenseKindOutcome, DbError>> {
	return safeDbCall(async () => {
		const current = await database
			.prepare("SELECT id FROM expense_kinds WHERE id = ?")
			.bind(id)
			.first<{ id: string }>();
		if (!current) return { kind: "not_found" };
		if (await findByName(database, input.name, id)) return { kind: "name_taken" };
		await database
			.prepare("UPDATE expense_kinds SET name = ?, icon_key = ?, updated_at = ? WHERE id = ?")
			.bind(input.name.trim(), input.iconKey, now.toISOString(), id)
			.run();
		const row = await database
			.prepare("SELECT id, name, icon_key, sort_order FROM expense_kinds WHERE id = ?")
			.bind(id)
			.first<ExpenseKindRow>();
		if (!row) return { kind: "not_found" };
		return { expenseKind: mapExpenseKind(row), kind: "updated" };
	});
}
