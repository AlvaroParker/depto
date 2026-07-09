import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { ExpenseShare, ShareStatus } from "@/lib/types/expense";

interface ShareRow {
	id: string;
	marked_by_user_id: string | null;
	paid_at: string | null;
	paid_to_participant_id: string | null;
	participant_id: string;
	participant_name: string;
	participant_slug: string;
	participant_sort_order: number;
	share_amount_minor: number;
	status: ShareStatus;
}

export type ShareStatusUpdate =
	{ kind: "updated"; share: ExpenseShare } | { kind: "not_found" } | { kind: "payer_immutable" };

async function readShare(database: D1Database, id: string): Promise<ShareRow | null> {
	return database
		.prepare(
			`SELECT s.id, s.share_amount_minor, s.status, s.paid_to_participant_id,
			        s.paid_at, s.marked_by_user_id, p.id AS participant_id,
			        p.name AS participant_name, p.slug AS participant_slug,
			        p.sort_order AS participant_sort_order
			 FROM expense_shares s
			 JOIN expenses e ON e.id = s.expense_id AND e.deleted_at IS NULL
			 JOIN participants p ON p.id = s.participant_id
			 WHERE s.id = ?`,
		)
		.bind(id)
		.first<ShareRow>();
}

function mapShare(row: ShareRow): ExpenseShare {
	return {
		id: row.id,
		markedByUserId: row.marked_by_user_id,
		paidAt: row.paid_at,
		paidToParticipantId: row.paid_to_participant_id,
		participant: {
			id: row.participant_id,
			name: row.participant_name,
			slug: row.participant_slug,
			sortOrder: row.participant_sort_order,
		},
		shareAmountMinor: row.share_amount_minor,
		status: row.status,
	};
}

export async function updateShareStatus(
	id: string,
	status: "pending" | "paid",
	markedByUserId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ShareStatusUpdate, DbError>> {
	return safeDbCall(async () => {
		const existing = await readShare(database, id);
		if (!existing) return { kind: "not_found" };
		if (existing.status === "settled") return { kind: "payer_immutable" };
		const timestamp = now.toISOString();
		await database
			.prepare(
				`UPDATE expense_shares
				 SET status = ?, paid_at = ?, marked_by_user_id = ?, updated_at = ?
				 WHERE id = ? AND status != 'settled'`,
			)
			.bind(
				status,
				status === "paid" ? timestamp : null,
				status === "paid" ? markedByUserId : null,
				timestamp,
				id,
			)
			.run();
		const updated = await readShare(database, id);
		if (!updated) return { kind: "not_found" };
		return { kind: "updated", share: mapShare(updated) };
	});
}
