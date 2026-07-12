import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	consumeAuthorizationCode,
	createGrantAndAuthorizationCode,
	createOAuthClient,
	findAccessTokenPrincipal,
	findOAuthClient,
	findRefreshToken,
	insertAccessAndRefreshTokens,
	revokeOAuthGrantForUser,
	revokeOAuthToken,
	rotateRefreshToken,
} from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import {
	completeMcpIdempotencyRecord,
	reserveMcpIdempotencyRecord,
} from "@/lib/db/mcp-idempotency";
import { createExpense } from "@/lib/db/expenses";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const now = new Date("2026-07-12T12:00:00.000Z");
const resource = "https://expenses.example";

describe("OAuth storage lifecycle", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('oauth-user', 'oauth-user', 'hash', 'OAuth User', 'participant_alvaro', 'user', ?, ?)`,
			)
			.bind(now.toISOString(), now.toISOString())
			.run();
	});

	afterEach(async () => bindings.dispose());

	async function createCode() {
		const clientResult = await createOAuthClient(
			{
				clientSecretHash: null,
				grantTypes: ["authorization_code", "refresh_token"],
				name: "Assistant",
				redirectUris: ["https://client.example/callback"],
				responseTypes: ["code"],
				tokenEndpointAuthMethod: "none",
			},
			bindings.database,
			now,
		);
		expect(clientResult.ok).toBe(true);
		if (clientResult.err) throw clientResult.val;
		const code = "authorization-code";
		const grantResult = await createGrantAndAuthorizationCode(
			{
				clientId: clientResult.val.id,
				codeChallenge: "a".repeat(43),
				codeHash: await sha256Base64Url(code),
				redirectUri: "https://client.example/callback",
				resource,
				scopes: ["expenses:read", "offline_access"],
				userId: "oauth-user",
			},
			bindings.database,
			now,
		);
		expect(grantResult.ok).toBe(true);
		if (grantResult.err) throw grantResult.val;
		return { client: clientResult.val, code, grant: grantResult.val };
	}

	it("stores only hashes and consumes authorization codes once", async () => {
		const fixture = await createCode();
		const storedClient = await findOAuthClient(fixture.client.id, bindings.database);
		if (storedClient.err) throw storedClient.val;
		expect(storedClient.val?.name).toBe("Assistant");
		const consumed = await consumeAuthorizationCode(
			await sha256Base64Url(fixture.code),
			bindings.database,
			now,
		);
		if (consumed.err) throw consumed.val;
		expect(consumed.val?.grantId).toBe(fixture.grant.grantId);
		const reused = await consumeAuthorizationCode(
			await sha256Base64Url(fixture.code),
			bindings.database,
			now,
		);
		if (reused.err) throw reused.val;
		expect(reused.val).toBeNull();
		const raw = await bindings.database
			.prepare("SELECT code_hash FROM oauth_authorization_codes WHERE id = ?")
			.bind(fixture.grant.codeId)
			.first<{ code_hash: string }>();
		expect(raw?.code_hash).not.toContain(fixture.code);
	});

	it("validates access token audience and immediate grant revocation", async () => {
		const fixture = await createCode();
		const accessToken = "access-token";
		const inserted = await insertAccessAndRefreshTokens(
			{
				accessTokenHash: await sha256Base64Url(accessToken),
				clientId: fixture.client.id,
				grantId: fixture.grant.grantId,
				resource,
				scopes: ["expenses:read"],
				userId: "oauth-user",
			},
			bindings.database,
			now,
		);
		expect(inserted.ok).toBe(true);
		const principal = await findAccessTokenPrincipal(
			await sha256Base64Url(accessToken),
			resource,
			bindings.database,
			now,
		);
		if (principal.err) throw principal.val;
		expect(principal.val?.participantId).toBe("participant_alvaro");
		expect(
			(
				await findAccessTokenPrincipal(
					await sha256Base64Url(accessToken),
					"https://other.example",
					bindings.database,
					now,
				)
			).val,
		).toBeNull();
		await revokeOAuthGrantForUser(fixture.grant.grantId, "oauth-user", bindings.database, now);
		expect(
			(
				await findAccessTokenPrincipal(
					await sha256Base64Url(accessToken),
					resource,
					bindings.database,
					now,
				)
			).val,
		).toBeNull();
	});

	it("rotates refresh tokens and revokes the family on reuse", async () => {
		const fixture = await createCode();
		const firstRefresh = "refresh-token-one";
		const familyId = crypto.randomUUID();
		await insertAccessAndRefreshTokens(
			{
				accessTokenHash: await sha256Base64Url("initial-access"),
				clientId: fixture.client.id,
				grantId: fixture.grant.grantId,
				refreshFamilyId: familyId,
				refreshTokenHash: await sha256Base64Url(firstRefresh),
				resource,
				scopes: ["expenses:read", "offline_access"],
				userId: "oauth-user",
			},
			bindings.database,
			now,
		);
		const current = await findRefreshToken(await sha256Base64Url(firstRefresh), bindings.database);
		if (current.err) throw current.val;
		expect(current.val).not.toBeNull();
		if (!current.val) throw new Error("Missing refresh token");
		const rotated = await rotateRefreshToken(
			current.val,
			{
				accessTokenHash: await sha256Base64Url("next-access"),
				refreshTokenHash: await sha256Base64Url("refresh-token-two"),
			},
			bindings.database,
			new Date(now.getTime() + 1_000),
		);
		expect(rotated.val).toEqual({ kind: "rotated" });
		const predecessor = await findRefreshToken(
			await sha256Base64Url(firstRefresh),
			bindings.database,
		);
		if (predecessor.err) throw predecessor.val;
		if (!predecessor.val) throw new Error("Missing predecessor");
		const reused = await rotateRefreshToken(
			predecessor.val,
			{
				accessTokenHash: await sha256Base64Url("bad-access"),
				refreshTokenHash: await sha256Base64Url("bad-refresh"),
			},
			bindings.database,
			new Date(now.getTime() + 2_000),
		);
		expect(reused.val).toEqual({ kind: "reuse" });
		const family = await bindings.database
			.prepare(
				"SELECT COUNT(*) AS count FROM oauth_refresh_tokens WHERE family_id = ? AND revoked_at IS NOT NULL",
			)
			.bind(familyId)
			.first<{ count: number }>();
		expect(family?.count).toBe(2);
	});

	it("revokes refresh families through the generic revocation operation", async () => {
		const fixture = await createCode();
		const refresh = "revocable-refresh";
		await insertAccessAndRefreshTokens(
			{
				accessTokenHash: await sha256Base64Url("revocable-access"),
				clientId: fixture.client.id,
				grantId: fixture.grant.grantId,
				refreshFamilyId: crypto.randomUUID(),
				refreshTokenHash: await sha256Base64Url(refresh),
				resource,
				scopes: ["expenses:read", "offline_access"],
				userId: "oauth-user",
			},
			bindings.database,
			now,
		);
		await revokeOAuthToken(await sha256Base64Url(refresh), bindings.database, now);
		const token = await findRefreshToken(await sha256Base64Url(refresh), bindings.database);
		if (token.err) throw token.val;
		expect(token.val?.revoked_at).toBe(now.toISOString());
	});

	it("reserves an idempotency key before the financial write under concurrency", async () => {
		const input = {
			idempotencyKey: "concurrent-key",
			requestHash: "request-hash",
			toolName: "create_expense",
			userId: "oauth-user",
		};
		const attempts = await Promise.all([
			reserveMcpIdempotencyRecord(input, bindings.database, now),
			reserveMcpIdempotencyRecord(input, bindings.database, now),
		]);
		expect(attempts.every((result) => result.ok)).toBe(true);
		expect(attempts.map((result) => result.val)).toEqual(
			expect.arrayContaining([{ kind: "reserved" }, { expenseId: null, kind: "existing" }]),
		);

		const expense = await createExpense(
			{
				amountMinor: 1000,
				currency: "CLP",
				description: null,
				expenseDate: "2026-07-12",
				kindId: "kind-other",
				name: "Idempotent expense",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro"],
				splitMode: "equal",
			},
			"oauth-user",
			bindings.database,
			now,
		);
		if (expense.err) throw expense.val;
		const completed = await completeMcpIdempotencyRecord(
			{ ...input, expenseId: expense.val.id },
			bindings.database,
		);
		expect(completed.ok && completed.val).toBe(true);
		const replay = await reserveMcpIdempotencyRecord(input, bindings.database, now);
		expect(replay.val).toEqual({ expenseId: expense.val.id, kind: "existing" });
		const conflict = await reserveMcpIdempotencyRecord(
			{ ...input, requestHash: "different-hash" },
			bindings.database,
			now,
		);
		expect(conflict.val).toEqual({ kind: "conflict" });
	});
});
