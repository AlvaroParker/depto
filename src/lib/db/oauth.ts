import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	OAuthAccessTokenPrincipal,
	OAuthClient,
	OAuthGrantSummary,
	OAuthScope,
} from "@/lib/types/oauth";
import { createId } from "@/lib/util/ids";
import { parseOAuthScopes, serializeOAuthScopes } from "@/lib/oauth/validation";
import { OAUTH_SCOPES } from "@/lib/oauth/constants";

interface OAuthClientRow {
	client_secret_hash: string | null;
	created_at: string;
	grant_types_json: string;
	id: string;
	last_used_at: string | null;
	name: string;
	redirect_uris_json: string;
	response_types_json: string;
	scopes: string;
	revoked_at: string | null;
	token_endpoint_auth_method: "none" | "client_secret_post";
}

interface AuthorizationCodeRow {
	client_id: string;
	client_secret_hash: string | null;
	client_revoked_at: string | null;
	code_challenge: string;
	consumed_at: string | null;
	expires_at: string;
	grant_id: string;
	grant_revoked_at: string | null;
	id: string;
	redirect_uri: string;
	resource: string;
	revoked_at: string | null;
	scopes: string;
	token_endpoint_auth_method: "none" | "client_secret_post";
	user_disabled_at: string | null;
	user_id: string;
	user_participant_id: string | null;
	user_role: string;
}

export interface RefreshTokenRow {
	client_id: string;
	client_secret_hash: string | null;
	client_revoked_at: string | null;
	expires_at: string;
	family_id: string;
	generation: number;
	grant_id: string;
	grant_revoked_at: string | null;
	id: string;
	resource: string;
	revoked_at: string | null;
	rotated_at: string | null;
	scopes: string;
	token_endpoint_auth_method: "none" | "client_secret_post";
	user_disabled_at: string | null;
	user_id: string;
	user_participant_id: string | null;
	user_role: string;
}

async function loadAuthorizationCode(
	codeHash: string,
	database: D1Database,
): Promise<AuthorizationCodeRow | null> {
	return database
		.prepare(
			`SELECT c.*, cl.client_secret_hash, cl.token_endpoint_auth_method,
			 cl.revoked_at AS client_revoked_at, g.revoked_at AS grant_revoked_at,
			 u.disabled_at AS user_disabled_at, u.role AS user_role,
			 u.participant_id AS user_participant_id
			 FROM oauth_authorization_codes c
			 JOIN oauth_clients cl ON cl.id = c.client_id
			 JOIN oauth_grants g ON g.id = c.grant_id
			 JOIN app_users u ON u.id = c.user_id
			 WHERE c.code_hash = ?`,
		)
		.bind(codeHash)
		.first<AuthorizationCodeRow>();
}

export interface RegisteredClientInput {
	clientSecretHash: string | null;
	grantTypes: ("authorization_code" | "refresh_token")[];
	name: string;
	redirectUris: string[];
	responseTypes: ["code"];
	scopes?: OAuthScope[];
	tokenEndpointAuthMethod: "none" | "client_secret_post";
}

export interface AuthorizationCodeRecord {
	clientId: string;
	clientSecretHash: string | null;
	codeChallenge: string;
	grantId: string;
	id: string;
	redirectUri: string;
	resource: string;
	scopes: OAuthScope[];
	tokenEndpointAuthMethod: "none" | "client_secret_post";
	userId: string;
}

export interface RefreshTokenRecord {
	clientId: string;
	clientSecretHash: string | null;
	familyId: string;
	generation: number;
	grantId: string;
	id: string;
	resource: string;
	scopes: OAuthScope[];
	tokenEndpointAuthMethod: "none" | "client_secret_post";
	userId: string;
}

function mapClient(row: OAuthClientRow): OAuthClient {
	return {
		clientSecretHash: row.client_secret_hash,
		createdAt: row.created_at,
		grantTypes: JSON.parse(row.grant_types_json) as OAuthClient["grantTypes"],
		id: row.id,
		lastUsedAt: row.last_used_at,
		name: row.name,
		redirectUris: JSON.parse(row.redirect_uris_json) as string[],
		responseTypes: JSON.parse(row.response_types_json) as ["code"],
		scopes: parseOAuthScopes(row.scopes) ?? [],
		revokedAt: row.revoked_at,
		tokenEndpointAuthMethod: row.token_endpoint_auth_method,
	};
}

function activeUserAndGrant(row: AuthorizationCodeRow | RefreshTokenRow, now: string): boolean {
	return (
		!row.client_revoked_at &&
		!row.grant_revoked_at &&
		!row.user_disabled_at &&
		row.user_role === "user" &&
		Boolean(row.user_participant_id) &&
		row.expires_at > now
	);
}

export async function createOAuthClient(
	input: RegisteredClientInput,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<OAuthClient, DbError>> {
	return safeDbCall(async () => {
		const id = createId();
		const timestamp = now.toISOString();
		await database
			.prepare(
				`INSERT INTO oauth_clients
				 (id, name, redirect_uris_json, grant_types_json, response_types_json,
				  token_endpoint_auth_method, client_secret_hash, created_at, updated_at, scopes)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				input.name,
				JSON.stringify(input.redirectUris),
				JSON.stringify(input.grantTypes),
				JSON.stringify(input.responseTypes),
				input.tokenEndpointAuthMethod,
				input.clientSecretHash,
				timestamp,
				timestamp,
				serializeOAuthScopes(input.scopes ?? OAUTH_SCOPES),
			)
			.run();
		return {
			clientSecretHash: input.clientSecretHash,
			createdAt: timestamp,
			grantTypes: input.grantTypes,
			id,
			lastUsedAt: null,
			name: input.name,
			redirectUris: input.redirectUris,
			responseTypes: input.responseTypes,
			scopes: [...(input.scopes ?? OAUTH_SCOPES)],
			revokedAt: null,
			tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
		};
	});
}

export async function findOAuthClient(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<OAuthClient | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare("SELECT * FROM oauth_clients WHERE id = ?")
			.bind(id)
			.first<OAuthClientRow>();
		return row ? mapClient(row) : null;
	});
}

export async function createGrantAndAuthorizationCode(
	input: {
		clientId: string;
		codeChallenge: string;
		codeHash: string;
		redirectUri: string;
		resource: string;
		scopes: OAuthScope[];
		userId: string;
	},
	database: D1Database = getDatabase(),
	now = new Date(),
	expiresAt = new Date(now.getTime() + 5 * 60_000),
): Promise<Result<{ codeId: string; grantId: string }, DbError>> {
	return safeDbCall(async () => {
		const grantId = createId();
		const codeId = createId();
		const timestamp = now.toISOString();
		await database.batch([
			database
				.prepare(
					`UPDATE oauth_grants SET revoked_at = ?, updated_at = ?
					 WHERE client_id = ? AND user_id = ? AND resource = ? AND revoked_at IS NULL`,
				)
				.bind(timestamp, timestamp, input.clientId, input.userId, input.resource),
			database
				.prepare(
					`UPDATE oauth_authorization_codes SET revoked_at = ?
					 WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL AND consumed_at IS NULL`,
				)
				.bind(timestamp, input.clientId, input.userId),
			database
				.prepare(
					`INSERT INTO oauth_grants
					 (id, client_id, user_id, resource, scopes, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					grantId,
					input.clientId,
					input.userId,
					input.resource,
					serializeOAuthScopes(input.scopes),
					timestamp,
					timestamp,
				),
			database
				.prepare(
					`INSERT INTO oauth_authorization_codes
					 (id, code_hash, grant_id, client_id, user_id, redirect_uri, resource, scopes,
					  code_challenge, code_challenge_method, created_at, expires_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'S256', ?, ?)`,
				)
				.bind(
					codeId,
					input.codeHash,
					grantId,
					input.clientId,
					input.userId,
					input.redirectUri,
					input.resource,
					serializeOAuthScopes(input.scopes),
					input.codeChallenge,
					timestamp,
					expiresAt.toISOString(),
				),
		]);
		return { codeId, grantId };
	});
}

export async function consumeAuthorizationCode(
	codeHash: string,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<AuthorizationCodeRecord | null, DbError>> {
	return safeDbCall(async () => {
		const row = await loadAuthorizationCode(codeHash, database);
		const timestamp = now.toISOString();
		if (!row || row.consumed_at || row.revoked_at || !activeUserAndGrant(row, timestamp)) {
			return null;
		}
		const consumed = await database
			.prepare(
				`UPDATE oauth_authorization_codes SET consumed_at = ?
				 WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
			)
			.bind(timestamp, row.id, timestamp)
			.run();
		if (consumed.meta.changes !== 1) return null;
		const scopes = parseOAuthScopes(row.scopes);
		if (!scopes) throw new Error("Stored OAuth scopes are invalid.");
		return {
			clientId: row.client_id,
			clientSecretHash: row.client_secret_hash,
			codeChallenge: row.code_challenge,
			grantId: row.grant_id,
			id: row.id,
			redirectUri: row.redirect_uri,
			resource: row.resource,
			scopes,
			tokenEndpointAuthMethod: row.token_endpoint_auth_method,
			userId: row.user_id,
		};
	});
}

export async function findAuthorizationCode(
	codeHash: string,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<AuthorizationCodeRecord | null, DbError>> {
	return safeDbCall(async () => {
		const row = await loadAuthorizationCode(codeHash, database);
		if (!row || row.consumed_at || row.revoked_at || !activeUserAndGrant(row, now.toISOString())) {
			return null;
		}
		const scopes = parseOAuthScopes(row.scopes);
		if (!scopes) throw new Error("Stored OAuth scopes are invalid.");
		return {
			clientId: row.client_id,
			clientSecretHash: row.client_secret_hash,
			codeChallenge: row.code_challenge,
			grantId: row.grant_id,
			id: row.id,
			redirectUri: row.redirect_uri,
			resource: row.resource,
			scopes,
			tokenEndpointAuthMethod: row.token_endpoint_auth_method,
			userId: row.user_id,
		};
	});
}

/** The fresh access-token ID ties every statement to this redemption, even at identical timestamps. */
export async function redeemAuthorizationCode(
	code: AuthorizationCodeRecord,
	input: { accessTokenHash: string; refreshTokenHash?: string },
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const accessId = createId();
		const familyId = input.refreshTokenHash ? createId() : null;
		const statements = [
			database
				.prepare(
					`INSERT INTO oauth_access_tokens
			(id, token_hash, grant_id, client_id, user_id, resource, scopes, refresh_family_id, created_at, expires_at)
			SELECT ?, ?, c.grant_id, c.client_id, c.user_id, c.resource, c.scopes, ?, ?, ?
			FROM oauth_authorization_codes c
			JOIN oauth_grants g ON g.id = c.grant_id JOIN oauth_clients cl ON cl.id = c.client_id
			JOIN app_users u ON u.id = c.user_id
			WHERE c.id = ? AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?
			AND g.revoked_at IS NULL AND cl.revoked_at IS NULL AND u.disabled_at IS NULL
			AND u.role = 'user' AND u.participant_id IS NOT NULL`,
				)
				.bind(
					accessId,
					input.accessTokenHash,
					familyId,
					timestamp,
					new Date(now.getTime() + 3_600_000).toISOString(),
					code.id,
					timestamp,
				),
		];
		if (input.refreshTokenHash) {
			statements.push(
				database
					.prepare(
						`INSERT INTO oauth_refresh_tokens
				(id, token_hash, family_id, generation, grant_id, client_id, user_id, resource, scopes, created_at, expires_at)
				SELECT ?, ?, refresh_family_id, 0, grant_id, client_id, user_id, resource, scopes, ?, ?
				FROM oauth_access_tokens WHERE id = ?`,
					)
					.bind(
						createId(),
						input.refreshTokenHash,
						timestamp,
						new Date(now.getTime() + 90 * 86_400_000).toISOString(),
						accessId,
					),
			);
		}
		statements.push(
			database
				.prepare(
					`UPDATE oauth_authorization_codes SET consumed_at = ?
			WHERE id = ? AND EXISTS (SELECT 1 FROM oauth_access_tokens WHERE id = ?)`,
				)
				.bind(timestamp, code.id, accessId),
		);
		const [inserted] = await database.batch(statements);
		return inserted.meta.changes === 1;
	});
}

export async function markAuthorizationCodeConsumed(
	id: string,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const result = await database
			.prepare(
				`UPDATE oauth_authorization_codes SET consumed_at = ?
				 WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
			)
			.bind(timestamp, id, timestamp)
			.run();
		return result.meta.changes === 1;
	});
}

export async function insertAccessAndRefreshTokens(
	input: {
		accessTokenHash: string;
		clientId: string;
		grantId: string;
		refreshFamilyId?: string;
		refreshTokenHash?: string;
		resource: string;
		scopes: OAuthScope[];
		userId: string;
	},
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<{ accessTokenId: string; refreshTokenId: string | null }, DbError>> {
	return safeDbCall(async () => {
		const accessTokenId = createId();
		const refreshTokenId = input.refreshTokenHash ? createId() : null;
		const timestamp = now.toISOString();
		const statements = [
			database
				.prepare(
					`INSERT INTO oauth_access_tokens
					 (id, token_hash, grant_id, client_id, user_id, resource, scopes,
					  refresh_family_id, created_at, expires_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					accessTokenId,
					input.accessTokenHash,
					input.grantId,
					input.clientId,
					input.userId,
					input.resource,
					serializeOAuthScopes(input.scopes),
					input.refreshFamilyId ?? null,
					timestamp,
					new Date(now.getTime() + 60 * 60_000).toISOString(),
				),
		];
		if (refreshTokenId && input.refreshTokenHash && input.refreshFamilyId) {
			statements.push(
				database
					.prepare(
						`INSERT INTO oauth_refresh_tokens
						 (id, token_hash, family_id, generation, grant_id, client_id, user_id,
						  resource, scopes, created_at, expires_at)
						 VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.bind(
						refreshTokenId,
						input.refreshTokenHash,
						input.refreshFamilyId,
						input.grantId,
						input.clientId,
						input.userId,
						input.resource,
						serializeOAuthScopes(input.scopes),
						timestamp,
						new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString(),
					),
			);
		}
		await database.batch(statements);
		return { accessTokenId, refreshTokenId };
	});
}

export async function findRefreshToken(
	tokenHash: string,
	database: D1Database = getDatabase(),
): Promise<Result<RefreshTokenRow | null, DbError>> {
	return safeDbCall(() =>
		database
			.prepare(
				`SELECT r.*, cl.client_secret_hash, cl.token_endpoint_auth_method,
				 cl.revoked_at AS client_revoked_at, g.revoked_at AS grant_revoked_at,
				 u.disabled_at AS user_disabled_at, u.role AS user_role,
				 u.participant_id AS user_participant_id
				 FROM oauth_refresh_tokens r
				 JOIN oauth_clients cl ON cl.id = r.client_id
				 JOIN oauth_grants g ON g.id = r.grant_id
				 JOIN app_users u ON u.id = r.user_id
				 WHERE r.token_hash = ?`,
			)
			.bind(tokenHash)
			.first<RefreshTokenRow>(),
	);
}

export async function revokeRefreshFamily(
	familyId: string,
	database: D1Database = getDatabase(),
	now = new Date(),
	reuseTokenId?: string,
): Promise<Result<void, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		await database.batch([
			database
				.prepare(
					`UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, ?),
					 reuse_detected_at = CASE WHEN id = ? THEN ? ELSE reuse_detected_at END
					 WHERE family_id = ?`,
				)
				.bind(timestamp, reuseTokenId ?? "", timestamp, familyId),
			database
				.prepare(
					`UPDATE oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?)
					 WHERE refresh_family_id = ?`,
				)
				.bind(timestamp, familyId),
		]);
	});
}

export async function rotateRefreshToken(
	row: RefreshTokenRow,
	input: { accessTokenHash: string; refreshTokenHash: string; scopes?: OAuthScope[] },
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<{ kind: "rotated" } | { kind: "reuse" } | { kind: "invalid" }, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		if (row.rotated_at) {
			const revoked = await revokeRefreshFamily(row.family_id, database, now, row.id);
			if (revoked.err) throw revoked.val.cause;
			return { kind: "reuse" };
		}
		if (row.revoked_at || !activeUserAndGrant(row, timestamp)) return { kind: "invalid" };
		const nextId = createId();
		const accessId = createId();
		const [inserted] = await database.batch([
			database
				.prepare(
					`INSERT INTO oauth_refresh_tokens
					 (id, token_hash, family_id, generation, grant_id, client_id, user_id, resource,
					  scopes, created_at, expires_at)
					 SELECT ?, ?, family_id, generation + 1, grant_id, client_id, user_id, resource,
					        ?, ?, ? FROM oauth_refresh_tokens
					 WHERE id = ? AND rotated_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
				)
				.bind(
					nextId,
					input.refreshTokenHash,
					input.scopes ? serializeOAuthScopes(input.scopes) : row.scopes,
					timestamp,
					new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString(),
					row.id,
					timestamp,
				),
			database
				.prepare(
					`UPDATE oauth_refresh_tokens SET rotated_at = ?, replaced_by_token_id = ?, last_used_at = ?
					 WHERE id = ? AND rotated_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
				)
				.bind(timestamp, nextId, timestamp, row.id, timestamp),
			database
				.prepare(
					`INSERT INTO oauth_access_tokens
					 (id, token_hash, grant_id, client_id, user_id, resource, scopes,
					  refresh_family_id, created_at, expires_at)
					 SELECT ?, ?, grant_id, client_id, user_id, resource, scopes, family_id, ?, ?
					 FROM oauth_refresh_tokens WHERE id = ?`,
				)
				.bind(
					accessId,
					input.accessTokenHash,
					timestamp,
					new Date(now.getTime() + 60 * 60_000).toISOString(),
					nextId,
				),
		]);
		if (inserted.meta.changes !== 1) {
			const revoked = await revokeRefreshFamily(row.family_id, database, now, row.id);
			if (revoked.err) throw revoked.val.cause;
			return { kind: "reuse" };
		}
		return { kind: "rotated" };
	});
}

export async function findAccessTokenPrincipal(
	tokenHash: string,
	resource: string,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<OAuthAccessTokenPrincipal | null, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const row = await database
			.prepare(
				`SELECT t.id, t.client_id, t.grant_id, t.user_id, t.resource, t.scopes,
				 t.last_used_at, u.username, u.display_name, u.participant_id, u.role,
				 u.disabled_at, g.revoked_at AS grant_revoked_at, c.revoked_at AS client_revoked_at
				 FROM oauth_access_tokens t
				 JOIN oauth_grants g ON g.id = t.grant_id
				 JOIN oauth_clients c ON c.id = t.client_id
				 JOIN app_users u ON u.id = t.user_id
				 WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > ? AND t.resource = ?`,
			)
			.bind(tokenHash, timestamp, resource)
			.first<{
				client_id: string;
				client_revoked_at: string | null;
				disabled_at: string | null;
				display_name: string;
				grant_id: string;
				grant_revoked_at: string | null;
				id: string;
				last_used_at: string | null;
				participant_id: string | null;
				resource: string;
				role: string;
				scopes: string;
				user_id: string;
				username: string;
			}>();
		if (
			!row ||
			row.disabled_at ||
			row.grant_revoked_at ||
			row.client_revoked_at ||
			row.role !== "user" ||
			!row.participant_id
		) {
			return null;
		}
		const scopes = parseOAuthScopes(row.scopes);
		if (!scopes) throw new Error("Stored OAuth scopes are invalid.");
		const cutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
		if (!row.last_used_at || row.last_used_at < cutoff) {
			await database.batch([
				database
					.prepare("UPDATE oauth_access_tokens SET last_used_at = ? WHERE id = ?")
					.bind(timestamp, row.id),
				database
					.prepare("UPDATE oauth_grants SET last_used_at = ?, updated_at = ? WHERE id = ?")
					.bind(timestamp, timestamp, row.grant_id),
				database
					.prepare("UPDATE oauth_clients SET last_used_at = ?, updated_at = ? WHERE id = ?")
					.bind(timestamp, timestamp, row.client_id),
			]);
		}
		return {
			clientId: row.client_id,
			displayName: row.display_name,
			grantId: row.grant_id,
			participantId: row.participant_id,
			resource: row.resource,
			role: "user",
			scopes,
			userId: row.user_id,
			username: row.username,
		};
	});
}

export async function revokeOAuthToken(
	tokenHash: string,
	database: D1Database = getDatabase(),
	now = new Date(),
	clientId?: string,
): Promise<Result<void, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const refresh = await database
			.prepare(
				`SELECT family_id FROM oauth_refresh_tokens
				 WHERE token_hash = ? AND (? IS NULL OR client_id = ?)`,
			)
			.bind(tokenHash, clientId ?? null, clientId ?? null)
			.first<{ family_id: string }>();
		if (refresh) {
			const revoked = await revokeRefreshFamily(refresh.family_id, database, now);
			if (revoked.err) throw revoked.val.cause;
			return;
		}
		await database
			.prepare(
				`UPDATE oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?)
				 WHERE token_hash = ? AND (? IS NULL OR client_id = ?)`,
			)
			.bind(timestamp, tokenHash, clientId ?? null, clientId ?? null)
			.run();
	});
}

export async function listOAuthGrantsForUser(
	userId: string,
	database: D1Database = getDatabase(),
): Promise<Result<OAuthGrantSummary[], DbError>> {
	return safeDbCall(async () => {
		const rows = await database
			.prepare(
				`SELECT g.id, c.name AS client_name, g.scopes, g.created_at, g.last_used_at
				 FROM oauth_grants g JOIN oauth_clients c ON c.id = g.client_id
				 WHERE g.user_id = ? AND g.revoked_at IS NULL AND c.revoked_at IS NULL
				 ORDER BY g.created_at DESC`,
			)
			.bind(userId)
			.all<{
				client_name: string;
				created_at: string;
				id: string;
				last_used_at: string | null;
				scopes: string;
			}>();
		return rows.results.map((row) => ({
			clientName: row.client_name,
			createdAt: row.created_at,
			id: row.id,
			lastUsedAt: row.last_used_at,
			scopes: parseOAuthScopes(row.scopes) ?? [],
		}));
	});
}

export async function revokeOAuthGrantForUser(
	grantId: string,
	userId: string,
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const [grant] = await database.batch([
			database
				.prepare(
					"UPDATE oauth_grants SET revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
				)
				.bind(timestamp, timestamp, grantId, userId),
			database
				.prepare(
					"UPDATE oauth_authorization_codes SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ? AND user_id = ?",
				)
				.bind(timestamp, grantId, userId),
			database
				.prepare(
					"UPDATE oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ? AND user_id = ?",
				)
				.bind(timestamp, grantId, userId),
			database
				.prepare(
					"UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ? AND user_id = ?",
				)
				.bind(timestamp, grantId, userId),
		]);
		return grant.meta.changes === 1;
	});
}

export function isRefreshTokenActive(row: RefreshTokenRow, now = new Date()): boolean {
	return !row.rotated_at && !row.revoked_at && activeUserAndGrant(row, now.toISOString());
}

export async function consumeOAuthRateLimit(
	operation: "registration" | "authorization" | "token_failure",
	keyHash: string,
	options: { blockMs: number; limit: number; windowMs: number },
	database: D1Database = getDatabase(),
	now = new Date(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const timestamp = now.toISOString();
		const row = await database
			.prepare(
				`INSERT INTO oauth_rate_limits
				 (operation, key_hash, attempt_count, window_started_at, blocked_until, updated_at)
				 VALUES (?1, ?2, 1, ?3, NULL, ?3)
				 ON CONFLICT(operation, key_hash) DO UPDATE SET
				 attempt_count = CASE WHEN blocked_until > ?3 THEN attempt_count
				   WHEN window_started_at <= ?4 THEN 1 ELSE attempt_count + 1 END,
				 window_started_at = CASE WHEN blocked_until > ?3 THEN window_started_at
				   WHEN window_started_at <= ?4 THEN ?3 ELSE window_started_at END,
				 blocked_until = CASE WHEN blocked_until > ?3 THEN blocked_until
				   WHEN window_started_at <= ?4 THEN NULL WHEN attempt_count + 1 > ?5 THEN ?6 ELSE NULL END,
				 updated_at = ?3
				 RETURNING blocked_until`,
			)
			.bind(
				operation,
				keyHash,
				timestamp,
				new Date(now.getTime() - options.windowMs).toISOString(),
				options.limit,
				new Date(now.getTime() + options.blockMs).toISOString(),
			)
			.first<{ blocked_until: string | null }>();
		return Boolean(row && !row.blocked_until);
	});
}
