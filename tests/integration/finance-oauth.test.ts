import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: vi.fn(),
	database: null as D1Database | null,
	receipts: null as R2Bucket | null,
}));

vi.mock("@/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/db/bindings", () => ({
	getBindings: () => ({
		APP_BASE_URL: "https://expenses.example",
		DB: state.database,
		RECEIPTS: state.receipts,
		RESEND_API_KEY: "",
		RESEND_FROM_EMAIL: "",
	}),
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import { GET as dashboard } from "@/app/api/dashboard/route";
import { POST as createExpenseRoute } from "@/app/api/expenses/route";
import {
	createGrantAndAuthorizationCode,
	createOAuthClient,
	insertAccessAndRefreshTokens,
} from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import type { OAuthScope } from "@/lib/types/oauth";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("finance API OAuth scope integration", () => {
	let bindings: TestBindings;
	let clientId: string;
	let grantId: string;

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.receipts = bindings.receipts;
		state.auth.mockReset();
		const timestamp = "2026-07-12T12:00:00.000Z";
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('finance-user', 'finance-user', 'hash', 'Finance User',
				 'participant_alvaro', 'user', ?, ?)`,
			)
			.bind(timestamp, timestamp)
			.run();
		const client = await createOAuthClient(
			{
				clientSecretHash: null,
				grantTypes: ["authorization_code"],
				name: "Finance Client",
				redirectUris: ["https://client.example/callback"],
				responseTypes: ["code"],
				tokenEndpointAuthMethod: "none",
			},
			bindings.database,
		);
		if (client.err) throw client.val;
		clientId = client.val.id;
		const grant = await createGrantAndAuthorizationCode(
			{
				clientId,
				codeChallenge: "a".repeat(43),
				codeHash: await sha256Base64Url("unused-code"),
				redirectUri: "https://client.example/callback",
				resource: "https://expenses.example",
				scopes: ["expenses:read", "expenses:write"],
				userId: "finance-user",
			},
			bindings.database,
		);
		if (grant.err) throw grant.val;
		grantId = grant.val.grantId;
	});

	afterEach(async () => {
		state.database = null;
		state.receipts = null;
		await bindings.dispose();
	});

	async function issue(rawToken: string, scopes: OAuthScope[]) {
		const result = await insertAccessAndRefreshTokens(
			{
				accessTokenHash: await sha256Base64Url(rawToken),
				clientId,
				grantId,
				resource: "https://expenses.example",
				scopes,
				userId: "finance-user",
			},
			bindings.database,
		);
		expect(result.ok).toBe(true);
	}

	function bearerRequest(path: string, token: string, init: RequestInit = {}) {
		return new Request(`https://expenses.example${path}`, {
			...init,
			headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
		});
	}

	it("accepts read scope, rejects the wrong scope, and never falls back on malformed bearer", async () => {
		const readToken = "r".repeat(43);
		const writeToken = "w".repeat(43);
		await issue(readToken, ["expenses:read"]);
		await issue(writeToken, ["expenses:write"]);
		expect((await dashboard(bearerRequest("/api/dashboard", readToken))).status).toBe(200);
		const insufficient = await dashboard(bearerRequest("/api/dashboard", writeToken));
		expect(insufficient.status).toBe(403);
		expect(insufficient.headers.get("www-authenticate")).toContain("insufficient_scope");

		state.auth.mockResolvedValue({
			user: {
				displayName: "Finance User",
				id: "finance-user",
				participantId: "participant_alvaro",
				role: "user",
				username: "finance-user",
			},
		});
		const malformed = await dashboard(
			new Request("https://expenses.example/api/dashboard", {
				headers: { authorization: "Bearer invalid" },
			}),
		);
		expect(malformed.status).toBe(401);
		expect(state.auth).not.toHaveBeenCalled();
	});

	it("preserves session access and limits expense creation to write scope", async () => {
		state.auth.mockResolvedValue({
			user: {
				displayName: "Finance User",
				id: "finance-user",
				participantId: "participant_alvaro",
				role: "user",
				username: "finance-user",
			},
		});
		expect((await dashboard(new Request("https://expenses.example/api/dashboard"))).status).toBe(
			200,
		);

		const readToken = "a".repeat(43);
		const writeToken = "b".repeat(43);
		await issue(readToken, ["expenses:read"]);
		await issue(writeToken, ["expenses:write"]);
		const expense = {
			amountMinor: 3000,
			currency: "CLP",
			description: null,
			expenseDate: "2026-07-12",
			kindId: "kind-other",
			name: "OAuth expense",
			paidByParticipantId: "participant_alvaro",
			participantIds: ["participant_alvaro", "participant_camila", "participant_trinidad"],
			splitMode: "equal",
		};
		const denied = await createExpenseRoute(
			bearerRequest("/api/expenses", readToken, {
				body: JSON.stringify(expense),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(denied.status).toBe(403);
		const created = await createExpenseRoute(
			bearerRequest("/api/expenses", writeToken, {
				body: JSON.stringify(expense),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(created.status).toBe(201);
	});
});
