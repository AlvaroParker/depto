import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { Participant } from "@/lib/types/participant";

interface ParticipantRow {
	id: string;
	name: string;
	slug: string;
	sort_order: number;
}

function mapParticipant(row: ParticipantRow): Participant {
	return { id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order };
}

export async function findActiveParticipants(
	database: D1Database = getDatabase(),
): Promise<Result<Participant[], DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				`SELECT id, name, slug, sort_order
				 FROM participants
				 WHERE active = 1
				 ORDER BY sort_order ASC`,
			)
			.all<ParticipantRow>();
		return result.results.map(mapParticipant);
	});
}

export async function findParticipantById(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<Participant | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT id, name, slug, sort_order
				 FROM participants
				 WHERE id = ? AND active = 1`,
			)
			.bind(id)
			.first<ParticipantRow>();
		return row ? mapParticipant(row) : null;
	});
}

export async function findParticipantsForExpense(
	expenseId: string,
	database: D1Database = getDatabase(),
): Promise<Result<Participant[], DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				`SELECT id, name, slug, sort_order
				 FROM participants
				 WHERE active = 1 OR EXISTS (
				   SELECT 1 FROM expense_shares
				   WHERE expense_id = ? AND participant_id = participants.id
				 )
				 ORDER BY sort_order ASC`,
			)
			.bind(expenseId)
			.all<ParticipantRow>();
		return result.results.map(mapParticipant);
	});
}
