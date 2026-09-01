import { describe, expect, it } from "vitest";
import {
	GetTelegramBalanceRequestSchema,
	GetTelegramDebtBreakdownRequestSchema,
	GetTelegramExpenseContextRequestSchema,
	GetTelegramExpenseRequestSchema,
	ListTelegramExpensesRequestSchema,
	TELEGRAM_CONVERSATION_RPC_VERSION,
	type TelegramReadResult,
} from "@/lib/telegram/conversation-contract";

const actorRequest = {
	telegramUserId: "123456789",
	version: TELEGRAM_CONVERSATION_RPC_VERSION,
} as const;

describe("Telegram conversation read RPC contract", () => {
	it("accepts the shared canonical actor request without normalizing it", () => {
		expect(GetTelegramExpenseContextRequestSchema.parse(actorRequest)).toEqual(actorRequest);
		expect(GetTelegramBalanceRequestSchema.parse(actorRequest)).toEqual(actorRequest);
	});

	it("defaults and trims strict list filters", () => {
		expect(ListTelegramExpensesRequestSchema.parse({ ...actorRequest, query: {} })).toEqual({
			...actorRequest,
			query: { page: 1, pageSize: 10, pending: "all" },
		});
		expect(
			ListTelegramExpensesRequestSchema.parse({
				...actorRequest,
				query: {
					kindId: " kind-groceries ",
					page: 2,
					pageSize: 3,
					payerId: " participant_camila ",
					pending: "mine",
					q: " mercado ",
				},
			}),
		).toEqual({
			...actorRequest,
			query: {
				kindId: "kind-groceries",
				page: 2,
				pageSize: 3,
				payerId: "participant_camila",
				pending: "mine",
				q: "mercado",
			},
		});
	});

	it("accepts a nonempty expense detail identifier", () => {
		expect(
			GetTelegramExpenseRequestSchema.parse({ ...actorRequest, expenseId: " expense-1 " }),
		).toEqual({ ...actorRequest, expenseId: "expense-1" });
	});

	it("accepts a strict paginated debt breakdown request", () => {
		expect(
			GetTelegramDebtBreakdownRequestSchema.parse({
				...actorRequest,
				counterpartyId: " participant_trinidad ",
				direction: "due_to_caller",
				page: 2,
				pageSize: 10,
			}),
		).toEqual({
			...actorRequest,
			counterpartyId: "participant_trinidad",
			direction: "due_to_caller",
			page: 2,
			pageSize: 10,
		});
	});

	it.each([
		["extra actor field", { ...actorRequest, extra: true }],
		["wrong version", { ...actorRequest, version: 2 }],
		["noncanonical Telegram ID", { ...actorRequest, telegramUserId: "00123" }],
		["whitespace Telegram ID", { ...actorRequest, telegramUserId: " 123 " }],
		["out-of-range Telegram ID", { ...actorRequest, telegramUserId: "1099511627776" }],
	])("rejects %s", (_case, request) => {
		expect(GetTelegramBalanceRequestSchema.safeParse(request).success).toBe(false);
	});

	it.each([
		[
			"a missing counterparty",
			{ ...actorRequest, direction: "due_to_caller", page: 1, pageSize: 10 },
		],
		[
			"an unsupported direction",
			{
				...actorRequest,
				counterpartyId: "participant_trinidad",
				direction: "net",
				page: 1,
				pageSize: 10,
			},
		],
		[
			"a zero page",
			{
				...actorRequest,
				counterpartyId: "participant_trinidad",
				direction: "owed_by_caller",
				page: 0,
				pageSize: 10,
			},
		],
		[
			"an oversized page",
			{
				...actorRequest,
				counterpartyId: "participant_trinidad",
				direction: "owed_by_caller",
				page: 1,
				pageSize: 11,
			},
		],
		[
			"an extra field",
			{
				...actorRequest,
				counterpartyId: "participant_trinidad",
				direction: "owed_by_caller",
				extra: true,
				page: 1,
				pageSize: 10,
			},
		],
	])("rejects debt request with %s", (_case, request) => {
		expect(GetTelegramDebtBreakdownRequestSchema.safeParse(request).success).toBe(false);
	});

	it.each([
		["a missing query", actorRequest],
		["an extra query field", { ...actorRequest, query: { extra: true } }],
		["a zero page", { ...actorRequest, query: { page: 0 } }],
		["an unsafe page", { ...actorRequest, query: { page: Number.MAX_SAFE_INTEGER + 1 } }],
		["an oversized page", { ...actorRequest, query: { pageSize: 11 } }],
		["a coerced page", { ...actorRequest, query: { page: "2" } }],
		["an oversized search", { ...actorRequest, query: { q: "x".repeat(121) } }],
		["an empty payer", { ...actorRequest, query: { payerId: " " } }],
		["an unknown pending filter", { ...actorRequest, query: { pending: "yes" } }],
	])("rejects %s", (_case, request) => {
		expect(ListTelegramExpensesRequestSchema.safeParse(request).success).toBe(false);
	});

	it("rejects missing and extra detail fields", () => {
		expect(GetTelegramExpenseRequestSchema.safeParse(actorRequest).success).toBe(false);
		expect(
			GetTelegramExpenseRequestSchema.safeParse({
				...actorRequest,
				expenseId: " ",
			}).success,
		).toBe(false);
		expect(
			GetTelegramExpenseRequestSchema.safeParse({
				...actorRequest,
				expenseId: "expense-1",
				unexpected: true,
			}).success,
		).toBe(false);
	});

	it("exposes one generic direct-data result shape", () => {
		const ok = {
			data: { participantId: "participant_alvaro" },
			kind: "ok",
			version: 1,
		} satisfies TelegramReadResult<{ participantId: string }>;
		const failure = {
			kind: "unauthorized",
			version: 1,
		} satisfies TelegramReadResult<{ participantId: string }>;

		expect(ok.data.participantId).toBe("participant_alvaro");
		expect(failure).not.toHaveProperty("data");
	});
});
