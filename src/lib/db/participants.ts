import "server-only";

import type { Result } from "ts-results";
import { PARTICIPANT_COUNT, SEEDED_PARTICIPANTS } from "@/lib/const/participants";
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

export async function findActiveParticipants(): Promise<Result<Participant[], DbError>> {
	return safeDbCall(async () => {
		const result = await getDatabase()
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
): Promise<Result<Participant | null, DbError>> {
	return safeDbCall(async () => {
		const row = await getDatabase()
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

export async function assertSeededParticipants(): Promise<Result<Participant[], DbError>> {
	return safeDbCall(async () => {
		const result = await getDatabase()
			.prepare(
				`SELECT id, name, slug, sort_order
				 FROM participants
				 WHERE active = 1
				 ORDER BY sort_order ASC`,
			)
			.all<ParticipantRow>();
		const participants = result.results.map(mapParticipant);
		const valid =
			participants.length === PARTICIPANT_COUNT &&
			participants.every((participant, index) => participant.id === SEEDED_PARTICIPANTS[index].id);
		if (!valid) throw new Error("The three seeded participants are not configured correctly.");
		return participants;
	});
}
