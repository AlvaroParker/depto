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

interface TelegramPrivacyNoticeVersionRow {
	telegram_privacy_notice_version: number;
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

function mapTelegramPrivacyNoticeVersion(
	row: TelegramPrivacyNoticeVersionRow | undefined,
): number | null {
	if (!row) return null;
	if (
		!Number.isSafeInteger(row.telegram_privacy_notice_version) ||
		row.telegram_privacy_notice_version < 0
	) {
		throw new Error("Stored Telegram privacy notice version is invalid.");
	}
	return row.telegram_privacy_notice_version;
}

export async function findTelegramPrivacyNoticeVersionByTelegramUserId(
	telegramUserId: string,
	database: D1Database = getDatabase(),
): Promise<Result<number | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT u.telegram_privacy_notice_version
				 FROM app_users u
				 JOIN participants p ON p.id = u.participant_id
				 WHERE u.telegram_user_id = ?
				   AND u.role = 'user'
				   AND u.disabled_at IS NULL
				   AND p.active = 1`,
			)
			.bind(telegramUserId)
			.first<TelegramPrivacyNoticeVersionRow>();
		return mapTelegramPrivacyNoticeVersion(row ?? undefined);
	});
}

export async function acknowledgeTelegramPrivacyNoticeVersionByTelegramUserId(
	telegramUserId: string,
	noticeVersion: number,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<number | null, DbError>> {
	return safeDbCall(async () => {
		if (!Number.isSafeInteger(noticeVersion) || noticeVersion <= 0) {
			throw new Error("Telegram privacy notice version is invalid.");
		}
		const results = await database.batch([
			database
				.prepare(
					`UPDATE app_users
					 SET telegram_privacy_notice_version = MAX(telegram_privacy_notice_version, ?),
					     updated_at = CASE
					       WHEN telegram_privacy_notice_version < ? THEN ?
					       ELSE updated_at
					     END
					 WHERE telegram_user_id = ?
					   AND role = 'user'
					   AND disabled_at IS NULL
					   AND EXISTS (
					     SELECT 1 FROM participants p
					     WHERE p.id = app_users.participant_id AND p.active = 1
					   )`,
				)
				.bind(noticeVersion, noticeVersion, now.toISOString(), telegramUserId),
			database
				.prepare(
					`SELECT u.telegram_privacy_notice_version
					 FROM app_users u
					 JOIN participants p ON p.id = u.participant_id
					 WHERE u.telegram_user_id = ?
					   AND u.role = 'user'
					   AND u.disabled_at IS NULL
					   AND p.active = 1`,
				)
				.bind(telegramUserId),
		]);
		const row = results[1]?.results[0] as unknown as TelegramPrivacyNoticeVersionRow | undefined;
		return mapTelegramPrivacyNoticeVersion(row);
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
