import "server-only";

import { Err, Ok, type Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError } from "@/lib/db/safe-db-call";
import {
	clearUsernameLoginAttempts,
	isLoginBlocked,
	recordFailedLogin,
} from "@/lib/db/login-attempts";
import { findAppUserByUsername, normalizeUsername } from "@/lib/db/users";
import type { SessionUser } from "@/lib/types/user";
import { verifyPassword } from "@/lib/util/password";

const DUMMY_PASSWORD_HASH =
	"pbkdf2-sha256$600000$AAECAwQFBgcICQoLDA0ODw$cQ79QFKxiqdwUtn6p_9MSdcEoA_WmyD-QXpFvftujWo";

interface AuthenticateCredentialsInput {
	clientAddress: string;
	database?: D1Database;
	now?: Date;
	password: string;
	username: string;
}

export async function authenticateCredentials({
	clientAddress,
	database = getDatabase(),
	now = new Date(),
	password,
	username,
}: AuthenticateCredentialsInput): Promise<Result<SessionUser | null, DbError>> {
	const normalizedUsername = normalizeUsername(username);
	const blocked = await isLoginBlocked({
		clientAddress,
		database,
		now,
		username: normalizedUsername,
	});
	if (blocked.err) return Err(blocked.val);
	if (blocked.val) return Ok(null);

	const userResult = await findAppUserByUsername(normalizedUsername, database);
	if (userResult.err) return Err(userResult.val);
	const user = userResult.val;
	const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
	if (!user || !passwordMatches || user.disabledAt) {
		const recorded = await recordFailedLogin({
			clientAddress,
			database,
			now,
			username: normalizedUsername,
		});
		if (recorded.err) return Err(recorded.val);
		return Ok(null);
	}

	const cleared = await clearUsernameLoginAttempts(normalizedUsername, database);
	if (cleared.err) return Err(cleared.val);
	return Ok({
		displayName: user.displayName,
		id: user.id,
		participantId: user.participantId,
		role: user.role,
		username: user.username,
	});
}
