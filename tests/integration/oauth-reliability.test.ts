import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exchange } from "@/app/oauth/token/route";
import { POST as decide } from "@/app/oauth/authorize/decision/route";
import { POST as register } from "@/app/oauth/register/route";
import {
	consumeOAuthRateLimit,
	createGrantAndAuthorizationCode,
	createOAuthClient,
	findAccessTokenPrincipal,
	cleanupOAuthRecords,
	listOAuthGrantsForUser,
	revokeOAuthGrantForUser,
} from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";
import { createExpense } from "@/lib/db/expenses";

const state = vi.hoisted(() => ({ database: undefined as D1Database | undefined }));
vi.mock("@/auth", () => ({
	auth: async () => ({ user: { id: "user", role: "user", participantId: "participant_alvaro" } }),
}));
vi.mock("@/lib/db/bindings", () => ({
	getDatabase: () => state.database,
	getBindings: () => ({ APP_BASE_URL: "https://expenses.example" }),
}));
const origin = "https://expenses.example";
const verifier = "v".repeat(43);

describe("OAuth reliability", () => {
	let bindings: TestBindings;
	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		await bindings.database
			.prepare(
				`INSERT INTO app_users
			(id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
			VALUES ('user', 'user', 'hash', 'User', 'participant_alvaro', 'user', '2026-01-01', '2026-01-01')`,
			)
			.run();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await bindings.dispose();
	});
	async function fixture() {
		const client = await createOAuthClient(
			{
				clientSecretHash: null,
				grantTypes: ["authorization_code", "refresh_token"],
				name: "ChatGPT",
				redirectUris: ["https://client.example/callback"],
				responseTypes: ["code"],
				tokenEndpointAuthMethod: "none",
			},
			bindings.database,
		);
		if (client.err) throw client.val;
		const code = crypto.randomUUID();
		const grant = await createGrantAndAuthorizationCode(
			{
				clientId: client.val.id,
				codeHash: await sha256Base64Url(code),
				codeChallenge: await sha256Base64Url(verifier),
				redirectUri: client.val.redirectUris[0],
				resource: origin,
				scopes: ["expenses:read", "offline_access"],
				userId: "user",
			},
			bindings.database,
		);
		if (grant.err) throw grant.val;
		const request = () =>
			new Request(`${origin}/oauth/token`, {
				method: "POST",
				body: new URLSearchParams({
					client_id: client.val.id,
					code,
					code_verifier: verifier,
					grant_type: "authorization_code",
					redirect_uri: client.val.redirectUris[0],
					resource: origin,
				}),
			});
		return { client: client.val, grant: grant.val, request };
	}
	it("preserves an authorization code when token insertion fails", async () => {
		const data = await fixture();
		await bindings.database
			.prepare(
				"CREATE TRIGGER fail_issuance BEFORE INSERT ON oauth_refresh_tokens BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END",
			)
			.run();
		expect((await exchange(data.request())).status).toBe(503);
		await bindings.database.prepare("DROP TRIGGER fail_issuance").run();
		expect((await exchange(data.request())).status).toBe(200);
		expect((await exchange(data.request())).status).toBe(400);
	});
	it("reports credential lookup outages as retryable, never invalid_grant", async () => {
		const data = await fixture();
		state.database = new Proxy(bindings.database, {
			get(target, key) {
				if (key === "prepare")
					return () => {
						throw new Error("storage unavailable");
					};
				return Reflect.get(target, key);
			},
		});
		const result = await exchange(data.request());
		expect(result.status).toBe(503);
		expect(await result.json()).toMatchObject({ error: "temporarily_unavailable" });
		state.database = bindings.database;
		expect((await exchange(data.request())).status).toBe(200);
	});
	it("cannot revoke another user's credentials", async () => {
		const data = await fixture();
		const issued = await exchange(data.request());
		const token = (await issued.json()) as { access_token: string };
		expect(
			(await revokeOAuthGrantForUser(data.grant.grantId, "other-user", bindings.database)).val,
		).toBe(false);
		const principal = await findAccessTokenPrincipal(
			await sha256Base64Url(token.access_token),
			origin,
			bindings.database,
		);
		expect(principal.val).toMatchObject({ userId: "user" });
	});
	it("issues only one credential pair for concurrent code exchanges", async () => {
		const data = await fixture();
		const results = await Promise.all(Array.from({ length: 5 }, () => exchange(data.request())));
		expect(results.map((result) => result.status).sort()).toEqual([200, 400, 400, 400, 400]);
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM oauth_access_tokens")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});
	it("counts simultaneous rate-limit attempts atomically", async () => {
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				consumeOAuthRateLimit(
					"registration",
					"same-key",
					{ limit: 1, windowMs: 60_000, blockMs: 30_000 },
					bindings.database,
				),
			),
		);
		expect(results.filter((result) => result.val === true)).toHaveLength(1);
	});
	it("distinguishes pending, active, refreshable and expired connections", async () => {
		const data = await fixture();
		expect((await listOAuthGrantsForUser("user", bindings.database)).val).toMatchObject([
			{ status: "awaiting_exchange" },
		]);
		await exchange(data.request());
		expect((await listOAuthGrantsForUser("user", bindings.database)).val).toMatchObject([
			{ status: "active", refreshExpiresAt: expect.any(String) },
		]);
		await bindings.database
			.prepare("UPDATE oauth_access_tokens SET expires_at = '2020-01-01'")
			.run();
		expect((await listOAuthGrantsForUser("user", bindings.database)).val).toMatchObject([
			{ status: "refreshable" },
		]);
		await bindings.database
			.prepare("UPDATE oauth_refresh_tokens SET expires_at = '2020-01-01'")
			.run();
		expect((await listOAuthGrantsForUser("user", bindings.database)).val).toMatchObject([
			{ status: "expired" },
		]);
	});
	it("retains refresh predecessors until the whole family expires and then removes the chain", async () => {
		const data = await fixture();
		const issued = await exchange(data.request());
		const first = (await issued.json()) as { refresh_token: string };
		const refresh = await exchange(
			new Request(`${origin}/oauth/token`, {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: data.client.id,
					resource: origin,
					refresh_token: first.refresh_token,
				}),
			}),
		);
		expect(refresh.status).toBe(200);
		await bindings.database
			.prepare(
				"UPDATE oauth_refresh_tokens SET expires_at = '2020-01-01' WHERE rotated_at IS NOT NULL",
			)
			.run();
		expect((await cleanupOAuthRecords(bindings.database)).val).toMatchObject({ refreshTokens: 0 });
		await bindings.database
			.prepare("UPDATE oauth_refresh_tokens SET expires_at = '2020-01-01'")
			.run();
		const cleaned = await cleanupOAuthRecords(bindings.database);
		expect(cleaned.val).toMatchObject({ refreshTokens: 2 });
		expect((await cleanupOAuthRecords(bindings.database)).val).toMatchObject({ refreshTokens: 0 });
	});
	it("keeps refresh credentials valid after a temporary lookup failure", async () => {
		const data = await fixture();
		const issued = await exchange(data.request());
		const first = (await issued.json()) as { refresh_token: string };
		const request = () =>
			new Request(`${origin}/oauth/token`, {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: data.client.id,
					resource: origin,
					refresh_token: first.refresh_token,
				}),
			});
		state.database = new Proxy(bindings.database, {
			get(target, key) {
				if (key === "prepare")
					return () => {
						throw new Error("transient outage");
					};
				return Reflect.get(target, key);
			},
		});
		const failed = await exchange(request());
		expect(failed.status).toBe(503);
		expect(failed.headers.get("retry-after")).toBe("5");
		const failure = (await failed.json()) as { request_id: string };
		expect(failed.headers.get("x-request-id")).toBe(failure.request_id);
		state.database = bindings.database;
		expect((await exchange(request())).status).toBe(200);
	});
	it("persists registered scope policy and refuses consent outside it", async () => {
		const registration = await register(
			new Request(`${origin}/oauth/register`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client_name: "Read only",
					redirect_uris: ["https://client.example/callback"],
					scope: "expenses:read",
				}),
			}),
		);
		const client = (await registration.json()) as { client_id: string; scope: string };
		expect(registration.status).toBe(201);
		expect(client.scope).toBe("expenses:read");
		for (const scope of ["expenses:write", "expenses:read offline_access"]) {
			const result = await decide(
				new Request(`${origin}/oauth/authorize/decision`, {
					method: "POST",
					headers: { origin },
					body: new URLSearchParams({
						client_id: client.client_id,
						scope,
						decision: "approve",
						response_type: "code",
						state: "test-state",
						resource: origin,
						redirect_uri: "https://client.example/callback",
						code_challenge_method: "S256",
						code_challenge: "a".repeat(43),
					}),
				}),
			);
			expect(result.status).toBe(400);
		}
		const grants = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM oauth_grants WHERE client_id = ?")
			.bind(client.client_id)
			.first<{ count: number }>();
		expect(grants?.count).toBe(0);
	});
	it("rejects scope escalation without consuming a refresh token, and supports scope reduction", async () => {
		const data = await fixture();
		const first = (await (await exchange(data.request())).json()) as { refresh_token: string };
		const refresh = (scope: string) =>
			exchange(
				new Request(`${origin}/oauth/token`, {
					method: "POST",
					body: new URLSearchParams({
						grant_type: "refresh_token",
						client_id: data.client.id,
						resource: origin,
						refresh_token: first.refresh_token,
						scope,
					}),
				}),
			);
		expect(await (await refresh("expenses:write")).json()).toMatchObject({
			error: "invalid_scope",
		});
		const reduced = await refresh("expenses:read");
		expect(reduced.status).toBe(200);
		const result = (await reduced.json()) as { access_token: string; scope: string };
		expect(result.scope).toBe("expenses:read");
		expect(
			(
				await findAccessTokenPrincipal(
					await sha256Base64Url(result.access_token),
					origin,
					bindings.database,
				)
			).val,
		).toMatchObject({ scopes: ["expenses:read"] });
	});
	it("cleans abandoned reservations but retains completed financial idempotency", async () => {
		const expense = await createExpense(
			{
				amountMinor: 1000,
				currency: "CLP",
				expenseDate: "2026-09-30",
				kindId: "kind-other",
				name: "Retained expense",
				paidByParticipantId: "participant_alvaro",
				participantIds: ["participant_alvaro"],
				splitMode: "equal",
			},
			"user",
			bindings.database,
		);
		if (expense.err) throw expense.val;
		for (const [key, expenseId] of [
			["completed", expense.val.id],
			["abandoned", null],
		] as const) {
			await bindings.database
				.prepare(
					"INSERT INTO mcp_idempotency_records (id, user_id, tool_name, idempotency_key, request_hash, expense_id, created_at, expires_at) VALUES (?, 'user', 'create_expense', ?, 'hash', ?, '2020-01-01', '2020-01-02')",
				)
				.bind(key, key, expenseId)
				.run();
		}
		expect((await cleanupOAuthRecords(bindings.database)).val).toMatchObject({
			abandonedIdempotency: 1,
		});
		const retained = await bindings.database
			.prepare("SELECT id FROM mcp_idempotency_records")
			.all<{ id: string }>();
		expect(retained.results).toEqual([{ id: "completed" }]);
	});
});
