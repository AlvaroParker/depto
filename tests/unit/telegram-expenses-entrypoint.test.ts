import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	attachTelegramExpenseReceipt: vi.fn(),
	createTelegramExpense: vi.fn(),
	findTelegramExpense: vi.fn(),
}));

vi.mock("@/lib/telegram/expense-service", () => mocks);

import { TelegramExpenses } from "@/worker/telegram-expenses";

describe("TelegramExpenses Worker entrypoint", () => {
	const database = {} as D1Database;
	const receipts = {} as R2Bucket;
	const env = {
		APP_BASE_URL: "https://depto.parker.ci",
		DB: database,
		RECEIPTS: receipts,
		RESEND_API_KEY: "resend-key",
		RESEND_FROM_EMAIL: "La cuenta <info@depto.parker.ci>",
	} as CloudflareEnv;
	let entrypoint: TelegramExpenses;

	beforeEach(() => {
		vi.clearAllMocks();
		entrypoint = new TelegramExpenses({} as ExecutionContext, env);
	});

	it("forwards lookup calls with only the bound website capabilities", async () => {
		const request = { telegramUserId: "123", updateId: 42, version: 1 };
		mocks.findTelegramExpense.mockResolvedValue({ kind: "not_found", version: 1 });
		await expect(entrypoint.findTelegramExpense(request)).resolves.toEqual({
			kind: "not_found",
			version: 1,
		});
		expect(mocks.findTelegramExpense).toHaveBeenCalledWith(request, {
			appBaseUrl: env.APP_BASE_URL,
			database,
			receipts,
			resendApiKey: env.RESEND_API_KEY,
			resendFromEmail: env.RESEND_FROM_EMAIL,
		});
	});

	it("transfers create and receipt-repair streams to the application service", async () => {
		const request = { telegramUserId: "123", updateId: 42, version: 1 };
		const createStream = new ReadableStream<Uint8Array>();
		const repairStream = new ReadableStream<Uint8Array>();
		mocks.createTelegramExpense.mockResolvedValue({ kind: "storage_error", version: 1 });
		mocks.attachTelegramExpenseReceipt.mockResolvedValue({ kind: "storage_error", version: 1 });

		await entrypoint.createTelegramExpense(request, createStream);
		await entrypoint.attachTelegramExpenseReceipt(request, repairStream);

		expect(mocks.createTelegramExpense).toHaveBeenCalledWith(
			request,
			createStream,
			expect.objectContaining({ database, receipts }),
		);
		expect(mocks.attachTelegramExpenseReceipt).toHaveBeenCalledWith(
			request,
			repairStream,
			expect.objectContaining({ database, receipts }),
		);
	});

	it("forwards text-only create calls without inventing a receipt stream", async () => {
		const request = { telegramUserId: "123", updateId: 43, version: 1 };
		mocks.createTelegramExpense.mockResolvedValue({ kind: "storage_error", version: 1 });

		await entrypoint.createTelegramExpense(request);

		expect(mocks.createTelegramExpense).toHaveBeenCalledWith(
			request,
			undefined,
			expect.objectContaining({ database, receipts }),
		);
	});
});
