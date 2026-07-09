import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { AppUser } from "@/lib/types/user";

interface AppUserRow {
	id: string;
	username: string;
	password_hash: string;
	display_name: string;
	participant_id: string | null;
	disabled_at: string | null;
}

export function normalizeUsername(username: string): string {
	return username.trim().toLocaleLowerCase("es-CL");
}

function mapAppUser(row: AppUserRow): AppUser {
	return {
		disabledAt: row.disabled_at,
		displayName: row.display_name,
		id: row.id,
		participantId: row.participant_id,
		passwordHash: row.password_hash,
		username: row.username,
	};
}

export async function findAppUserByUsername(
	username: string,
	database: D1Database = getDatabase(),
): Promise<Result<AppUser | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT id, username, password_hash, display_name, participant_id, disabled_at
				 FROM app_users
				 WHERE username = ? COLLATE NOCASE`,
			)
			.bind(normalizeUsername(username))
			.first<AppUserRow>();
		return row ? mapAppUser(row) : null;
	});
}
