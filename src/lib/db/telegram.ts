import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";

interface TelegramUserIdRow {
	telegram_user_id: string | null;
}

export type FindTelegramUserIdOutcome =
	{ kind: "found"; telegramUserId: string | null } | { kind: "not_found" };

export type SetTelegramUserIdOutcome =
	| { kind: "not_found" }
	| { kind: "telegram_user_id_taken" }
	| { kind: "updated"; telegramUserId: string };

export type ClearTelegramUserIdOutcome = { kind: "cleared" } | { kind: "not_found" };

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
