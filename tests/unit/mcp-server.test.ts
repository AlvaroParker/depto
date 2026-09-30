import { afterEach, describe, expect, it, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const mocks = vi.hoisted(() => ({ createExpenseTool: vi.fn() }));

vi.mock("@/lib/mcp/tools", () => ({
	createExpenseTool: mocks.createExpenseTool,
}));

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
	afterEach(async () => {
		mocks.createExpenseTool.mockReset();
		await Promise.all(closers.splice(0).map((close) => close()));
	});

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

	it("discovers sixteen annotated tools with output schemas", async () => {
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
			"update_expense",
			"delete_expense",
			"attach_expense_receipt",
			"remove_expense_receipt",
			"read_expense_file",
			"pay_all_my_debt",
			"get_my_debt_breakdown",
			"get_expense_report",
		]);
		expect(body.result.tools.every(({ outputSchema }) => outputSchema)).toBe(true);
		expect(body.result.tools[0]?.annotations).toMatchObject({
			destructiveHint: false,
			idempotentHint: true,
			readOnlyHint: true,
		});
	});

	it("publishes ChatGPT file descriptors and OAuth policy on the wire", async () => {
		const response = await request({ id: 4, jsonrpc: "2.0", method: "tools/list", params: {} });
		const body = (await response.json()) as {
			result: {
				tools: {
					name: string;
					securitySchemes: unknown;
					_meta: Record<string, unknown>;
					inputSchema: { properties: Record<string, unknown> };
				}[];
			};
		};
		for (const tool of body.result.tools) {
			expect(tool.securitySchemes, tool.name).toEqual(tool._meta.securitySchemes);
			expect(tool.securitySchemes, tool.name).toEqual([
				{ type: "oauth2", scopes: [expect.any(String)] },
			]);
			for (const field of (tool._meta["openai/fileParams"] ?? []) as string[]) {
				expect(tool.inputSchema.properties[field], `${tool.name}.${field}`).toMatchObject({
					type: "object",
					required: ["download_url", "file_id"],
					properties: {
						download_url: { type: "string" },
						file_id: { type: "string" },
						mime_type: { type: "string" },
						file_name: { type: "string" },
					},
				});
				expect(tool.inputSchema.properties[field]).not.toHaveProperty("anyOf");
			}
		}
	});

	it.each([
		["defaults email notifications on", undefined, true],
		["allows email notifications to be disabled", false, false],
	])("%s for expense creation", async (_case, sendEmailNotifications, expected) => {
		mocks.createExpenseTool.mockResolvedValue({
			content: [{ text: "Gasto creado correctamente.", type: "text" }],
			structuredContent: { expense: {}, notification: "skipped", replayed: false },
		});
		const args = {
			amountMinor: 10_000,
			expenseDate: "2026-07-12",
			idempotencyKey: crypto.randomUUID(),
			kindId: "kind-other",
			name: "Supermercado",
			paidByParticipantId: "participant_trinidad",
			participantIds: ["participant_alvaro", "participant_camila"],
			...(sendEmailNotifications === undefined ? {} : { sendEmailNotifications }),
		};
		const response = await request({
			id: 3,
			jsonrpc: "2.0",
			method: "tools/call",
			params: { arguments: args, name: "create_expense" },
		});
		expect(response.status).toBe(200);
		expect(mocks.createExpenseTool).toHaveBeenCalledWith(
			expect.objectContaining({
				paidByParticipantId: "participant_trinidad",
				participantIds: ["participant_alvaro", "participant_camila"],
				sendEmailNotifications: expected,
			}),
			actor,
		);
	});
});
