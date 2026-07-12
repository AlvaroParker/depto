import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateRequestActor: vi.fn() }));

vi.mock("@/lib/auth/actor", () => ({
	authenticateRequestActor: mocks.authenticateRequestActor,
}));
vi.mock("@/lib/oauth/metadata", () => ({
	getOAuthOrigin: () => "https://expenses.example",
}));

import { DELETE, GET, POST } from "@/app/mcp/route";

describe("MCP Streamable HTTP route", () => {
	beforeEach(() => mocks.authenticateRequestActor.mockReset());

	it("returns protocol-compliant 405 responses for unused streaming methods", () => {
		for (const response of [GET(), DELETE()]) {
			expect(response.status).toBe(405);
			expect(response.headers.get("allow")).toBe("POST");
		}
	});

	it("rejects mismatched Host and supplied Origin before authentication", async () => {
		const badHost = await POST(
			new Request("https://expenses.example/mcp", {
				headers: { host: "attacker.example" },
				method: "POST",
			}),
		);
		expect(badHost.status).toBe(400);
		const badOrigin = await POST(
			new Request("https://expenses.example/mcp", {
				headers: { host: "expenses.example", origin: "https://attacker.example" },
				method: "POST",
			}),
		);
		expect(badOrigin.status).toBe(403);
		expect(mocks.authenticateRequestActor).not.toHaveBeenCalled();
	});

	it("challenges unauthenticated callers with protected-resource metadata", async () => {
		mocks.authenticateRequestActor.mockResolvedValue({ kind: "unauthenticated" });
		const response = await POST(
			new Request("https://expenses.example/mcp", {
				headers: { host: "expenses.example" },
				method: "POST",
			}),
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toContain(
			"/.well-known/oauth-protected-resource",
		);
	});

	it("initializes an authenticated OAuth client in stateless JSON mode", async () => {
		mocks.authenticateRequestActor.mockResolvedValue({
			actor: {
				clientId: "client",
				displayName: "Alvaro",
				grantId: "grant",
				participantId: "participant_alvaro",
				role: "user",
				scopes: new Set(["expenses:read"]),
				source: "oauth",
				userId: "user",
				username: "alvaro",
			},
			kind: "authenticated",
		});
		const response = await POST(
			new Request("https://expenses.example/mcp", {
				body: JSON.stringify({
					id: 1,
					jsonrpc: "2.0",
					method: "initialize",
					params: {
						capabilities: {},
						clientInfo: { name: "test", version: "1.0.0" },
						protocolVersion: "2025-06-18",
					},
				}),
				headers: {
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${"a".repeat(43)}`,
					"content-type": "application/json",
					host: "expenses.example",
				},
				method: "POST",
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { result: { serverInfo: { name: string } } };
		expect(body.result.serverInfo.name).toBe("gastos-compartidos");
	});
});
