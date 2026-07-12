import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ auth: vi.fn(), database: null as D1Database | null }));

vi.mock("@/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/db/bindings", () => ({
	getBindings: () => ({ APP_BASE_URL: "https://expenses.example", DB: state.database }),
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import { GET as listGrants } from "@/app/api/oauth/grants/route";
import { DELETE as disconnectGrant } from "@/app/api/oauth/grants/[id]/route";
import {
	createGrantAndAuthorizationCode,
	createOAuthClient,
	findAccessTokenPrincipal,
	insertAccessAndRefreshTokens,
} from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("session-only connected application management", () => {
	let bindings: TestBindings;
	let grantId: string;
	const rawToken = "g".repeat(43);

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.auth.mockReset();
		state.auth.mockResolvedValue({
			user: {
				displayName: "Grant User",
				id: "grant-user",
				participantId: "participant_alvaro",
				role: "user",
				username: "grant-user",
			},
		});
		const timestamp = "2026-07-12T12:00:00.000Z";
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('grant-user', 'grant-user', 'hash', 'Grant User',
				 'participant_alvaro', 'user', ?, ?)`,
			)
			.bind(timestamp, timestamp)
			.run();
		const client = await createOAuthClient(
			{
				clientSecretHash: null,
				grantTypes: ["authorization_code"],
				name: "Connected Assistant",
				redirectUris: ["https://client.example/callback"],
				responseTypes: ["code"],
				tokenEndpointAuthMethod: "none",
			},
			bindings.database,
		);
		if (client.err) throw client.val;
		const grant = await createGrantAndAuthorizationCode(
			{
				clientId: client.val.id,
				codeChallenge: "a".repeat(43),
				codeHash: await sha256Base64Url("grant-code"),
				redirectUri: "https://client.example/callback",
				resource: "https://expenses.example",
				scopes: ["expenses:read"],
				userId: "grant-user",
			},
			bindings.database,
		);
		if (grant.err) throw grant.val;
		grantId = grant.val.grantId;
		await insertAccessAndRefreshTokens(
			{
				accessTokenHash: await sha256Base64Url(rawToken),
				clientId: client.val.id,
				grantId,
				resource: "https://expenses.example",
				scopes: ["expenses:read"],
				userId: "grant-user",
			},
			bindings.database,
		);
	});

	afterEach(async () => {
		state.database = null;
		await bindings.dispose();
	});

	it("lists safe client metadata but rejects bearer access even with a valid cookie session", async () => {
		const response = await listGrants(new Request("https://expenses.example/api/oauth/grants"));
		expect(response.status).toBe(200);
		const body = (await response.json()) as { grants: Record<string, unknown>[] };
		expect(body.grants).toEqual([
			expect.objectContaining({ clientName: "Connected Assistant", scopes: ["expenses:read"] }),
		]);
		expect(JSON.stringify(body)).not.toMatch(/token|secret|hash/i);

		const bearer = await listGrants(
			new Request("https://expenses.example/api/oauth/grants", {
				headers: { authorization: `Bearer ${rawToken}` },
			}),
		);
		expect(bearer.status).toBe(401);
	});

	it("disconnects an owned grant and invalidates its unexpired access token", async () => {
		const response = await disconnectGrant(
			new Request(`https://expenses.example/api/oauth/grants/${grantId}`, { method: "DELETE" }),
			{ params: Promise.resolve({ id: grantId }) },
		);
		expect(response.status).toBe(204);
		const principal = await findAccessTokenPrincipal(
			await sha256Base64Url(rawToken),
			"https://expenses.example",
			bindings.database,
		);
		if (principal.err) throw principal.val;
		expect(principal.val).toBeNull();
	});
});
