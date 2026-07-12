import { afterEach, describe, expect, it } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createExpenseMcpServer } from "@/lib/mcp/server";
import type { OAuthActor } from "@/lib/types/actor";

const actor: OAuthActor = {
	clientId: "client",
	displayName: "Alvaro",
	grantId: "grant",
	participantId: "participant_alvaro",
	role: "user",
	scopes: new Set(["expenses:read", "expenses:write", "reimbursements:write"]),
	source: "oauth",
	userId: "user",
	username: "alvaro",
};

describe("MCP server definition", () => {
	const closers: (() => Promise<void>)[] = [];
	afterEach(async () => Promise.all(closers.splice(0).map((close) => close())));

	async function request(body: unknown) {
		const server = createExpenseMcpServer(actor);
		const transport = new WebStandardStreamableHTTPServerTransport({
			enableJsonResponse: true,
			sessionIdGenerator: undefined,
		});
		await server.connect(transport);
		closers.push(() => server.close());
		return transport.handleRequest(
			new Request("https://expenses.example/mcp", {
				body: JSON.stringify(body),
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					"mcp-protocol-version": "2025-06-18",
				},
				method: "POST",
			}),
		);
	}

	it("initializes in stateless JSON mode", async () => {
		const response = await request({
			id: 1,
			jsonrpc: "2.0",
			method: "initialize",
			params: {
				capabilities: {},
				clientInfo: { name: "test", version: "1.0.0" },
				protocolVersion: "2025-06-18",
			},
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		const body = (await response.json()) as { result: { serverInfo: { name: string } } };
		expect(body.result.serverInfo.name).toBe("gastos-compartidos");
	});

	it("discovers exactly eight annotated tools with output schemas", async () => {
		const response = await request({ id: 2, jsonrpc: "2.0", method: "tools/list", params: {} });
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			result: {
				tools: { annotations?: Record<string, boolean>; name: string; outputSchema?: unknown }[];
			};
		};
		expect(body.result.tools.map(({ name }) => name)).toEqual([
			"get_expense_reference_data",
			"get_my_balance",
			"list_expenses",
			"get_expense",
			"create_expense",
			"set_my_payment_status",
			"mark_my_payment_paid_with_proof",
			"update_my_open_share_amount",
		]);
		expect(body.result.tools.every(({ outputSchema }) => outputSchema)).toBe(true);
		expect(body.result.tools[0]?.annotations).toMatchObject({
			destructiveHint: false,
			idempotentHint: true,
			readOnlyHint: true,
		});
	});
});
