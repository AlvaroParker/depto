import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exchange } from "@/app/oauth/token/route";
import {
	consumeOAuthRateLimit,
	createGrantAndAuthorizationCode,
	createOAuthClient,
	findAccessTokenPrincipal,
	revokeOAuthGrantForUser,
} from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const state = vi.hoisted(() => ({ database: undefined as D1Database | undefined }));
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
});
