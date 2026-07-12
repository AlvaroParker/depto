import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	findAccessTokenPrincipal: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/oauth", () => ({
	findAccessTokenPrincipal: mocks.findAccessTokenPrincipal,
}));
vi.mock("@/lib/oauth/metadata", () => ({
	getOAuthOrigin: () => "https://expenses.example",
}));

import { authenticateRequestActor } from "@/lib/auth/actor";

function request(authorization?: string) {
	return new Request("https://expenses.example/api/dashboard", {
		headers: authorization ? { authorization } : {},
	});
}

describe("authenticated actor precedence and scopes", () => {
	beforeEach(() => {
		mocks.auth.mockReset();
		mocks.findAccessTokenPrincipal.mockReset();
	});

	it("does not fall back to a valid session when any Authorization header is invalid", async () => {
		mocks.auth.mockResolvedValue({ user: { id: "session-user" } });
		const result = await authenticateRequestActor(request("Basic abc"), {
			requiredScope: "expenses:read",
		});
		expect(result).toEqual({ kind: "unauthenticated" });
		expect(mocks.auth).not.toHaveBeenCalled();
	});

	it("returns an OAuth actor only for a valid resource-bound token with scope", async () => {
		mocks.findAccessTokenPrincipal.mockResolvedValue({
			err: false,
			val: {
				clientId: "client",
				displayName: "Alvaro",
				grantId: "grant",
				participantId: "participant",
				resource: "https://expenses.example",
				role: "user",
				scopes: ["expenses:read"],
				userId: "user",
				username: "alvaro",
			},
		});
		const result = await authenticateRequestActor(request(`Bearer ${"a".repeat(43)}`), {
			requiredScope: "expenses:read",
		});
		expect(result.kind).toBe("authenticated");
		if (result.kind === "authenticated") expect(result.actor.source).toBe("oauth");
	});

	it("reports the precise missing scope", async () => {
		mocks.findAccessTokenPrincipal.mockResolvedValue({
			err: false,
			val: {
				clientId: "client",
				displayName: "Alvaro",
				grantId: "grant",
				participantId: "participant",
				resource: "https://expenses.example",
				role: "user",
				scopes: ["expenses:read"],
				userId: "user",
				username: "alvaro",
			},
		});
		expect(
			await authenticateRequestActor(request(`Bearer ${"a".repeat(43)}`), {
				requiredScope: "expenses:write",
			}),
		).toEqual({ kind: "forbidden", requiredScope: "expenses:write" });
	});

	it("uses Auth.js only when Authorization is absent", async () => {
		mocks.auth.mockResolvedValue({
			user: {
				displayName: "Root",
				id: "root",
				participantId: null,
				role: "root",
				username: "root",
			},
		});
		const result = await authenticateRequestActor(request(), { requiredScope: "expenses:write" });
		expect(result.kind).toBe("authenticated");
		if (result.kind === "authenticated") expect(result.actor.role).toBe("root");
	});
});
