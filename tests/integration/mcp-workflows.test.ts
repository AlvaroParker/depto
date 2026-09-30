import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";
import { PNG_BASE64 } from "../fixtures/files";
import { ExpenseSchema, ReportSchema, DebtSchema } from "@/lib/mcp/schemas";
import {
	ExpenseComparisonSchema,
	ExpenseTrendsSchema,
	MySpendingSchema,
} from "@/lib/types/spending-insights";
import {
	createOAuthClient,
	createGrantAndAuthorizationCode,
	insertAccessAndRefreshTokens,
} from "@/lib/db/oauth";
import { createOAuthCredential, sha256Base64Url } from "@/lib/oauth/crypto";
import type { OAuthScope } from "@/lib/types/oauth";
import { POST, GET, DELETE } from "@/app/mcp/route";

const state = vi.hoisted(() => ({
	database: undefined as D1Database | undefined,
	receipts: undefined as R2Bucket | undefined,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/bindings", () => ({
	getDatabase: () => state.database,
	getBindings: () => ({
		APP_BASE_URL: "https://expenses.example",
		DB: state.database,
		RECEIPTS: state.receipts,
		RESEND_API_KEY: "",
		RESEND_FROM_EMAIL: "",
	}),
}));

const origin = "https://expenses.example";
const proofInline = { base64: PNG_BASE64, filename: "proof.png", mimeType: "image/png" };
const expenseInput = () => ({
	amountMinor: 3000,
	expenseDate: "2026-09-30",
	idempotencyKey: crypto.randomUUID(),
	kindId: "kind-other",
	name: "SDK expense",
	paidByParticipantId: "participant_camila",
	participantIds: ["participant_alvaro", "participant_camila"],
	sendEmailNotifications: false,
});

describe("Authenticated MCP SDK workflows", () => {
	let bindings: TestBindings;
	const clients: Client[] = [];
	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.receipts = bindings.receipts;
		await bindings.database
			.prepare(
				"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('sdk-user', 'sdk-user', 'hash', 'SDK User', 'participant_alvaro', 'user', '2026-01-01', '2026-01-01')",
			)
			.run();
	});
	afterEach(async () => {
		await Promise.all(clients.splice(0).map((client) => client.close()));
		await bindings.dispose();
	});
	async function connect(
		scopes: OAuthScope[] = ["expenses:read", "expenses:write", "reimbursements:write"],
		userId = "sdk-user",
	) {
		const registered = await createOAuthClient({
			name: "SDK",
			clientSecretHash: null,
			grantTypes: ["authorization_code"],
			redirectUris: ["https://client.example/callback"],
			responseTypes: ["code"],
			tokenEndpointAuthMethod: "none",
		});
		if (registered.err) throw registered.val;
		const grant = await createGrantAndAuthorizationCode({
			clientId: registered.val.id,
			userId,
			codeChallenge: "a".repeat(43),
			codeHash: await sha256Base64Url(crypto.randomUUID()),
			redirectUri: registered.val.redirectUris[0],
			resource: origin,
			scopes,
		});
		if (grant.err) throw grant.val;
		const token = createOAuthCredential();
		const issued = await insertAccessAndRefreshTokens({
			accessTokenHash: await sha256Base64Url(token),
			clientId: registered.val.id,
			grantId: grant.val.grantId,
			userId,
			scopes,
			resource: origin,
		});
		if (issued.err) throw issued.val;
		const client = new Client({ name: "regression-sdk", version: "1" });
		clients.push(client);
		await client.connect(
			new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
				requestInit: { headers: { authorization: `Bearer ${token}` } },
				fetch: async (input, init) => {
					const request = new Request(input, init);
					request.headers.set("host", "expenses.example");
					return request.method === "POST"
						? POST(request)
						: request.method === "GET"
							? GET()
							: DELETE();
				},
			}),
		);
		await client.listTools(); // Enables SDK output-schema validation on subsequent calls.
		return client;
	}
	async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
		const result = await client.callTool({ name, arguments: args });
		expect(result.isError, JSON.stringify(result)).not.toBe(true);
		return result;
	}
	it("executes all nineteen tools through bearer authentication and SDK schema validation", async () => {
		const client = await connect();
		expect((await client.listTools()).tools).toHaveLength(19);
		await call(client, "get_expense_reference_data");
		const input = {
			...expenseInput(),
			splitMode: "open",
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 1000 },
				{ participantId: "participant_camila", shareAmountMinor: 2000 },
			],
		};
		const created = await call(client, "create_expense", input);
		const { expense } = z.object({ expense: ExpenseSchema }).parse(created.structuredContent);
		const expenseId = expense.id;
		await call(client, "get_expense", { expenseId });
		await call(client, "list_expenses", { dateFrom: "2026-09-30", dateTo: "2026-09-30" });
		await call(client, "get_my_balance");
		await call(client, "update_my_open_share_amount", { expenseId, amountMinor: 1200 });
		await call(client, "mark_my_payment_paid_with_proof", { expenseId, proofInline });
		const shareId = expense.shares.find(
			(share) => share.participant.id === "participant_alvaro",
		)!.id;
		const proof = await call(client, "read_expense_file", {
			expenseId,
			kind: "payment_proof",
			shareId,
		});
		expect(proof.content).toContainEqual({
			type: "image",
			data: PNG_BASE64,
			mimeType: "image/png",
		});
		await call(client, "set_my_payment_status", { expenseId, status: "pending" });
		await call(client, "update_expense", {
			...input,
			expenseId,
			name: "Edited SDK expense",
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 1200 },
				{ participantId: "participant_camila", shareAmountMinor: 1800 },
			],
		});
		await call(client, "attach_expense_receipt", { expenseId, receiptInline: proofInline });
		await call(client, "read_expense_file", { expenseId, kind: "receipt" });
		await call(client, "remove_expense_receipt", { expenseId });
		const debt = await call(client, "get_my_debt_breakdown", {
			counterpartyId: "participant_camila",
			direction: "owed_by_caller",
		});
		expect(z.object({ debt: DebtSchema }).parse(debt.structuredContent).debt.totalAmountMinor).toBe(
			1200,
		);
		const report = await call(client, "get_expense_report", {
			dateFrom: "2026-09-30",
			dateTo: "2026-09-30",
		});
		expect(
			z.object({ report: ReportSchema }).parse(report.structuredContent).report.totalAmountMinor,
		).toBe(3000);
		const range = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };
		await call(client, "get_expense_comparison", {
			period: range,
			baseline: { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
		});
		await call(client, "get_expense_trends", range);
		await call(client, "get_my_spending_report", range);
		await call(client, "pay_all_my_debt", {
			paidToParticipantId: "participant_camila",
			proofInline,
		});
		const paid = await call(client, "get_expense", { expenseId });
		expect(
			z
				.object({ expense: ExpenseSchema })
				.parse(paid.structuredContent)
				.expense.shares.find((share) => share.id === shareId)?.status,
		).toBe("paid");
		await call(client, "delete_expense", { expenseId });
		const emptyReport = await call(client, "get_expense_report", {
			dateFrom: "2026-09-30",
			dateTo: "2026-09-30",
		});
		expect(
			z.object({ report: ReportSchema }).parse(emptyReport.structuredContent).report.expenseCount,
		).toBe(0);
	});
	it("returns comparisons, trends, and caller-bound shares using read-only credentials", async () => {
		const writer = await connect();
		await call(writer, "create_expense", {
			...expenseInput(),
			amountMinor: 100_000,
			expenseDate: "2026-08-31",
			kindId: "kind-common-expenses",
		});
		await call(writer, "create_expense", {
			...expenseInput(),
			amountMinor: 115_000,
			expenseDate: "2026-09-01",
			kindId: "kind-common-expenses",
			splitMode: "custom",
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 15_000 },
				{ participantId: "participant_camila", shareAmountMinor: 100_000 },
			],
		});
		const reader = await connect(["expenses:read"]);
		const range = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };
		const comparison = await call(reader, "get_expense_comparison", {
			period: range,
			baseline: { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
			kind: "kind-common-expenses",
		});
		expect(
			z.object({ comparison: ExpenseComparisonSchema }).parse(comparison.structuredContent)
				.comparison.change,
		).toEqual({ amountMinor: 15_000, percent: 15 });
		const trends = await call(reader, "get_expense_trends", {
			dateFrom: "2026-07-01",
			dateTo: range.dateTo,
			kind: "kind-common-expenses",
		});
		expect(
			z
				.object({ trends: ExpenseTrendsSchema })
				.parse(trends.structuredContent)
				.trends.months.map((month) => month.totalAmountMinor),
		).toEqual([0, 100_000, 115_000]);
		const personal = await call(reader, "get_my_spending_report", {
			...range,
			participantId: "participant_camila",
		});
		expect(
			z.object({ report: MySpendingSchema }).parse(personal.structuredContent).report,
		).toMatchObject({
			participantId: "participant_alvaro",
			allocatedAmountMinor: 15_000,
			paidUpfrontAmountMinor: 0,
			pendingToPayAmountMinor: 15_000,
		});
		await bindings.database
			.prepare(
				"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('sdk-camila', 'sdk-camila', 'hash', 'Camila', 'participant_camila', 'user', '2026-01-01', '2026-01-01')",
			)
			.run();
		const otherReader = await connect(["expenses:read"], "sdk-camila");
		const other = await call(otherReader, "get_my_spending_report", range);
		expect(
			z.object({ report: MySpendingSchema }).parse(other.structuredContent).report,
		).toMatchObject({
			participantId: "participant_camila",
			allocatedAmountMinor: 100_000,
			paidUpfrontAmountMinor: 115_000,
			pendingToReceiveAmountMinor: 15_000,
		});
	});

	it("validates report ranges at the MCP boundary and requires expenses:read", async () => {
		const reader = await connect(["expenses:read"]);
		const denied = await connect(["expenses:write"]);
		const range = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };
		for (const name of ["get_expense_comparison", "get_expense_trends", "get_my_spending_report"]) {
			const valid = name === "get_expense_comparison" ? { period: range, baseline: range } : range;
			const forbidden = await denied.callTool({ name, arguments: valid });
			expect(forbidden.isError).toBe(true);
			expect(forbidden.structuredContent).toMatchObject({ code: "INSUFFICIENT_SCOPE" });
			expect(forbidden._meta?.["mcp/www_authenticate"]).toEqual([
				expect.stringContaining('scope="expenses:read"'),
			]);
			for (const invalidRange of [
				{ dateFrom: "2026-09-30", dateTo: "2026-09-01" },
				{ dateFrom: "2020-01-01", dateTo: "2026-09-30" },
				{ dateFrom: "2026-02-30", dateTo: "2026-09-30" },
			]) {
				const args =
					name === "get_expense_comparison"
						? { period: range, baseline: invalidRange }
						: invalidRange;
				const invalid = await reader.callTool({ name, arguments: args });
				expect(invalid.isError, name).toBe(true);
			}
		}
	});
	it("returns actionable challenges for every write tool with read-only credentials", async () => {
		const client = await connect(["expenses:read"]);
		for (const [name, args] of [
			["create_expense", expenseInput()],
			["update_expense", { ...expenseInput(), expenseId: "missing" }],
			["delete_expense", { expenseId: "missing" }],
			["attach_expense_receipt", { expenseId: "missing", receiptInline: proofInline }],
			["remove_expense_receipt", { expenseId: "missing" }],
			["set_my_payment_status", { expenseId: "missing", status: "paid" }],
			["mark_my_payment_paid_with_proof", { expenseId: "missing", proofInline }],
			["update_my_open_share_amount", { expenseId: "missing", amountMinor: 10 }],
			["pay_all_my_debt", { paidToParticipantId: "participant_camila" }],
		] as const) {
			const result = await client.callTool({ name, arguments: args });
			expect(result.isError, name).toBe(true);
			expect(result._meta?.["mcp/www_authenticate"], name).toEqual([
				expect.stringContaining('error="insufficient_scope"'),
			]);
		}
	});
	it("identifies invalid allocation fields and preserves paid reimbursement permissions", async () => {
		const client = await connect();
		const input = expenseInput();
		const invalid = await client.callTool({
			name: "create_expense",
			arguments: { ...input, splitMode: "custom", shareAllocations: [] },
		});
		expect(invalid.structuredContent).toMatchObject({
			code: "VALIDATION_ERROR",
			issues: [expect.objectContaining({ path: "shareAllocations" })],
		});
		const created = await call(client, "create_expense", input);
		const expenseId = z.object({ expense: ExpenseSchema }).parse(created.structuredContent)
			.expense.id;
		await call(client, "set_my_payment_status", { expenseId, status: "paid" });
		const update = await client.callTool({
			name: "update_expense",
			arguments: { ...input, expenseId, amountMinor: 4000 },
		});
		expect(update.structuredContent).toMatchObject({ code: "PAID_RESET_REQUIRED" });
		await call(client, "update_expense", {
			...input,
			expenseId,
			amountMinor: 4000,
			resetPaidReimbursements: true,
		});
		const openInput = {
			...expenseInput(),
			splitMode: "open",
			shareAllocations: [
				{ participantId: "participant_alvaro", shareAmountMinor: 1000 },
				{ participantId: "participant_camila", shareAmountMinor: 2000 },
			],
		};
		const open = await call(client, "create_expense", openInput);
		const openId = z.object({ expense: ExpenseSchema }).parse(open.structuredContent).expense.id;
		const forbidden = await client.callTool({
			name: "update_expense",
			arguments: {
				...openInput,
				expenseId: openId,
				shareAllocations: [
					{ participantId: "participant_alvaro", shareAmountMinor: 1500 },
					{ participantId: "participant_camila", shareAmountMinor: 1500 },
				],
			},
		});
		expect(forbidden.structuredContent).toMatchObject({ code: "FORBIDDEN" });
		const locked = await client.callTool({
			name: "update_my_open_share_amount",
			arguments: { expenseId, amountMinor: 1000 },
		});
		expect(locked.structuredContent).toMatchObject({ code: "NOT_OPEN" });
		const excessive = await client.callTool({
			name: "update_my_open_share_amount",
			arguments: { expenseId: openId, amountMinor: 4000 },
		});
		expect(excessive.structuredContent).toMatchObject({ code: "AMOUNT_EXCEEDS_TOTAL" });
	});
});
