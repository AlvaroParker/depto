import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";

interface TelegramUserIdRow {
	telegram_user_id: string | null;
}

interface TelegramExpenseActorRow {
	display_name: string;
	participant_id: string;
	user_id: string;
	username: string;
}

export interface TelegramExpenseActor {
	displayName: string;
	participantId: string;
	userId: string;
	username: string;
}

export type FindTelegramUserIdOutcome =
	{ kind: "found"; telegramUserId: string | null } | { kind: "not_found" };

export type SetTelegramUserIdOutcome =
	| { kind: "not_found" }
	| { kind: "telegram_user_id_taken" }
	| { kind: "updated"; telegramUserId: string };

export type ClearTelegramUserIdOutcome = { kind: "cleared" } | { kind: "not_found" };

export async function findTelegramExpenseActorByTelegramUserId(
	telegramUserId: string,
	database: D1Database = getDatabase(),
): Promise<Result<TelegramExpenseActor | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT u.id AS user_id, u.username, u.display_name, u.participant_id
				 FROM app_users u
				 JOIN participants p ON p.id = u.participant_id
				 WHERE u.telegram_user_id = ?
				   AND u.role = 'user'
				   AND u.disabled_at IS NULL
				   AND p.active = 1`,
			)
			.bind(telegramUserId)
			.first<TelegramExpenseActorRow>();
		return row
			? {
					displayName: row.display_name,
					participantId: row.participant_id,
					userId: row.user_id,
					username: row.username,
				}
			: null;
	});
}

export async function findTelegramUserIdForUser(
	userId: string,
	database: D1Database = getDatabase(),
): Promise<Result<FindTelegramUserIdOutcome, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT telegram_user_id
				 FROM app_users
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL`,
			)
			.bind(userId)
			.first<TelegramUserIdRow>();
		return row ? { kind: "found", telegramUserId: row.telegram_user_id } : { kind: "not_found" };
	});
}

export async function setTelegramUserIdForUser(
	userId: string,
	telegramUserId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<SetTelegramUserIdOutcome, DbError>> {
	return safeDbCall(async () => {
		const updated = await database
			.prepare(
				`UPDATE app_users
				 SET telegram_user_id = ?, updated_at = ?
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL
				   AND NOT EXISTS (
				     SELECT 1
				     FROM app_users AS owner
				     WHERE owner.telegram_user_id = ? AND owner.id <> ?
				   )`,
			)
			.bind(telegramUserId, now.toISOString(), userId, telegramUserId, userId)
			.run();
		if (updated.meta.changes === 1) {
			return { kind: "updated", telegramUserId };
		}

		const user = await database
			.prepare(
				`SELECT telegram_user_id
				 FROM app_users
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL`,
			)
			.bind(userId)
			.first<TelegramUserIdRow>();
		return user ? { kind: "telegram_user_id_taken" } : { kind: "not_found" };
	});
}

export async function clearTelegramUserIdForUser(
	userId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ClearTelegramUserIdOutcome, DbError>> {
	return safeDbCall(async () => {
		const cleared = await database
			.prepare(
				`UPDATE app_users
				 SET telegram_user_id = NULL, updated_at = ?
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL
				   AND telegram_user_id IS NOT NULL`,
			)
			.bind(now.toISOString(), userId)
			.run();
		if (cleared.meta.changes === 1) return { kind: "cleared" };

		const user = await database
			.prepare(
				`SELECT telegram_user_id
				 FROM app_users
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL`,
			)
			.bind(userId)
			.first<TelegramUserIdRow>();
		return user ? { kind: "cleared" } : { kind: "not_found" };
	});
}
