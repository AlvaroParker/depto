import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null as D1Database | null }));

vi.mock("@/lib/db/bindings", () => ({
	getBindings: () => ({
		APP_BASE_URL: "https://expenses.example",
		DB: state.database,
		RECEIPTS: {},
		RESEND_API_KEY: "",
		RESEND_FROM_EMAIL: "",
	}),
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import { GET as authorizationMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { POST as register } from "@/app/oauth/register/route";
import { POST as exchange } from "@/app/oauth/token/route";
import { createGrantAndAuthorizationCode } from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("OAuth discovery, registration, and token lifecycle", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		const timestamp = "2026-07-12T12:00:00.000Z";
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('oauth-route-user', 'oauth-route-user', 'hash', 'OAuth User',
				 'participant_alvaro', 'user', ?, ?)`,
			)
			.bind(timestamp, timestamp)
			.run();
	});

	afterEach(async () => {
		state.database = null;
		await bindings.dispose();
	});

	it("publishes matching protected-resource and authorization-server metadata", async () => {
		const resource = await resourceMetadata(
			new Request("https://expenses.example/.well-known/oauth-protected-resource"),
		);
		const resourceBody = (await resource.json()) as {
			authorization_servers: string[];
			resource: string;
		};
		expect(resourceBody).toMatchObject({
			authorization_servers: ["https://expenses.example"],
			resource: "https://expenses.example",
		});
		const server = await authorizationMetadata(
			new Request("https://expenses.example/.well-known/oauth-authorization-server"),
		);
		const serverBody = (await server.json()) as Record<string, unknown>;
		expect(serverBody).toMatchObject({
			authorization_endpoint: "https://expenses.example/oauth/authorize",
			code_challenge_methods_supported: ["S256"],
			issuer: "https://expenses.example",
			token_endpoint: "https://expenses.example/oauth/token",
		});
	});

	it("registers a public client and performs code exchange plus refresh reuse detection", async () => {
		const registration = await register(
			new Request("https://expenses.example/oauth/register", {
				body: JSON.stringify({
					client_name: "Expense Assistant",
					grant_types: ["authorization_code", "refresh_token"],
					redirect_uris: ["https://client.example/callback"],
					response_types: ["code"],
					token_endpoint_auth_method: "none",
				}),
				headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
				method: "POST",
			}),
		);
		expect(registration.status).toBe(201);
		const client = (await registration.json()) as { client_id: string };
		const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
		const rawCode = "authorization-code-value";
		const issued = await createGrantAndAuthorizationCode(
			{
				clientId: client.client_id,
				codeChallenge: await sha256Base64Url(verifier),
				codeHash: await sha256Base64Url(rawCode),
				redirectUri: "https://client.example/callback",
				resource: "https://expenses.example",
				scopes: ["expenses:read", "offline_access"],
				userId: "oauth-route-user",
			},
			bindings.database,
		);
		expect(issued.ok).toBe(true);

		const token = await exchange(
			new Request("https://expenses.example/oauth/token", {
				body: new URLSearchParams({
					client_id: client.client_id,
					code: rawCode,
					code_verifier: verifier,
					grant_type: "authorization_code",
					redirect_uri: "https://client.example/callback",
					resource: "https://expenses.example",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
				method: "POST",
			}),
		);
		expect(token.status).toBe(200);
		expect(token.headers.get("cache-control")).toBe("no-store");
		const first = (await token.json()) as { access_token: string; refresh_token: string };
		expect(first.access_token).toHaveLength(43);
		expect(first.refresh_token).toHaveLength(43);

		async function refresh(value: string) {
			return exchange(
				new Request("https://expenses.example/oauth/token", {
					body: new URLSearchParams({
						client_id: client.client_id,
						grant_type: "refresh_token",
						refresh_token: value,
						resource: "https://expenses.example",
					}),
					headers: { "content-type": "application/x-www-form-urlencoded" },
					method: "POST",
				}),
			);
		}

		const rotated = await refresh(first.refresh_token);
		expect(rotated.status).toBe(200);
		const second = (await rotated.json()) as { refresh_token: string };
		expect(second.refresh_token).not.toBe(first.refresh_token);
		const reuse = await refresh(first.refresh_token);
		expect(reuse.status).toBe(400);
		expect(await reuse.json()).toMatchObject({ error: "invalid_grant" });
		const successorAfterReuse = await refresh(second.refresh_token);
		expect(successorAfterReuse.status).toBe(400);
	});

	it("does not consume a code when PKCE or exact redirect validation fails", async () => {
		const registration = await register(
			new Request("https://expenses.example/oauth/register", {
				body: JSON.stringify({
					client_name: "Client",
					redirect_uris: ["https://client.example/callback"],
				}),
				headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.5" },
				method: "POST",
			}),
		);
		const client = (await registration.json()) as { client_id: string };
		const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
		await createGrantAndAuthorizationCode(
			{
				clientId: client.client_id,
				codeChallenge: await sha256Base64Url(verifier),
				codeHash: await sha256Base64Url("code"),
				redirectUri: "https://client.example/callback",
				resource: "https://expenses.example",
				scopes: ["expenses:read"],
				userId: "oauth-route-user",
			},
			bindings.database,
		);
		const failed = await exchange(
			new Request("https://expenses.example/oauth/token", {
				body: new URLSearchParams({
					client_id: client.client_id,
					code: "code",
					code_verifier: `${verifier}wrong`,
					grant_type: "authorization_code",
					redirect_uri: "https://client.example/other",
					resource: "https://expenses.example",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
				method: "POST",
			}),
		);
		expect(failed.status).toBe(400);
		const stored = await bindings.database
			.prepare("SELECT consumed_at FROM oauth_authorization_codes WHERE code_hash = ?")
			.bind(await sha256Base64Url("code"))
			.first<{ consumed_at: string | null }>();
		expect(stored?.consumed_at).toBeNull();
	});
});
