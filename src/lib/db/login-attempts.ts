import "server-only";

import { Ok, type Result } from "ts-results";
import { LOGIN_ATTEMPT_LIMIT, LOGIN_LOCK_MS, LOGIN_WINDOW_MS } from "@/lib/const/auth";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import { normalizeUsername } from "@/lib/db/users";
import type { LoginAttemptScope } from "@/lib/types/user";
import { bytesToBase64Url } from "@/lib/util/encoding";

interface LoginAttemptInput {
	clientAddress: string;
	database?: D1Database;
	now?: Date;
	username: string;
}

async function opaqueKey(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return bytesToBase64Url(new Uint8Array(digest));
}

async function scopeKey(scope: LoginAttemptScope, value: string): Promise<string> {
	return opaqueKey(`${scope}:${value}`);
}

export async function isLoginBlocked({
	clientAddress,
	database = getDatabase(),
	now = new Date(),
	username,
}: LoginAttemptInput): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const [usernameKey, addressKey] = await Promise.all([
			scopeKey("username", normalizeUsername(username)),
			scopeKey("ip", clientAddress),
		]);
		const row = await database
			.prepare(
				`SELECT 1 AS blocked
				 FROM login_attempts
				 WHERE locked_until > ?
				   AND ((scope = 'username' AND key_hash = ?)
				     OR (scope = 'ip' AND key_hash = ?))
				 LIMIT 1`,
			)
			.bind(now.toISOString(), usernameKey, addressKey)
			.first<{ blocked: number }>();
		return Boolean(row?.blocked);
	});
}

function failedAttemptStatement(
	database: D1Database,
	scope: LoginAttemptScope,
	keyHash: string,
	now: Date,
): D1PreparedStatement {
	const nowValue = now.toISOString();
	const windowCutoff = new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString();
	const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MS).toISOString();
	return database
		.prepare(
			`INSERT INTO login_attempts
			 (scope, key_hash, attempt_count, window_started_at, locked_until, updated_at)
			 VALUES (?, ?, 1, ?, NULL, ?)
			 ON CONFLICT(scope, key_hash) DO UPDATE SET
			   attempt_count = CASE
			     WHEN login_attempts.window_started_at <= ? THEN 1
			     ELSE login_attempts.attempt_count + 1
			   END,
			   window_started_at = CASE
			     WHEN login_attempts.window_started_at <= ? THEN ?
			     ELSE login_attempts.window_started_at
			   END,
			   locked_until = CASE
			     WHEN login_attempts.locked_until > ? THEN login_attempts.locked_until
			     WHEN (CASE
			       WHEN login_attempts.window_started_at <= ? THEN 1
			       ELSE login_attempts.attempt_count + 1
			     END) >= ? THEN ?
			     ELSE NULL
			   END,
			   updated_at = ?`,
		)
		.bind(
			scope,
			keyHash,
			nowValue,
			nowValue,
			windowCutoff,
			windowCutoff,
			nowValue,
			nowValue,
			windowCutoff,
			LOGIN_ATTEMPT_LIMIT,
			lockUntil,
			nowValue,
		);
}

export async function recordFailedLogin({
	clientAddress,
	database = getDatabase(),
	now = new Date(),
	username,
}: LoginAttemptInput): Promise<Result<void, DbError>> {
	return safeDbCall(async () => {
		const [usernameKey, addressKey] = await Promise.all([
			scopeKey("username", normalizeUsername(username)),
			scopeKey("ip", clientAddress),
		]);
		await database.batch([
			failedAttemptStatement(database, "username", usernameKey, now),
			failedAttemptStatement(database, "ip", addressKey, now),
		]);
	});
}

export async function clearUsernameLoginAttempts(
	username: string,
	database: D1Database = getDatabase(),
): Promise<Result<void, DbError>> {
	const key = await scopeKey("username", normalizeUsername(username));
	const result = await safeDbCall(async () => {
		await database
			.prepare("DELETE FROM login_attempts WHERE scope = 'username' AND key_hash = ?")
			.bind(key)
			.run();
	});
	return result.ok ? Ok.EMPTY : result;
}
