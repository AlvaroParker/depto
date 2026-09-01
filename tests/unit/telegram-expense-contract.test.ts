import { describe, expect, it } from "vitest";
import {
	AttachTelegramExpenseReceiptRequestSchema,
	CreateTelegramExpenseRequestSchema,
	FindTelegramExpenseRequestSchema,
} from "@/lib/telegram/expense-contract";

const receipt = {
	contentType: "image/jpeg",
	filename: "boleta.jpg",
	sizeBytes: 4,
};

const equalRequest = {
	expense: {
		amountMinor: 12_000,
		description: "Compra semanal",
		expenseDate: "2026-08-31",
		kindId: "kind-other",
		name: "Supermercado",
		paidByParticipantId: "participant_alvaro",
		participantIds: ["participant_alvaro", "participant_camila"],
		shareAllocations: [],
		splitMode: "equal",
	},
	receipt,
	telegramUserId: "123456789",
	updateId: 42,
	version: 1,
};

describe("Telegram expense RPC contract", () => {
	it("accepts strict equal and exact custom expense requests", () => {
		expect(CreateTelegramExpenseRequestSchema.safeParse(equalRequest).success).toBe(true);
		expect(
			CreateTelegramExpenseRequestSchema.safeParse({ ...equalRequest, receipt: undefined }).success,
		).toBe(true);
		expect(
			CreateTelegramExpenseRequestSchema.safeParse({
				...equalRequest,
				receipt: { ...receipt, contentType: "application/pdf" },
			}).success,
		).toBe(true);
		expect(
			CreateTelegramExpenseRequestSchema.safeParse({
				...equalRequest,
				expense: {
					...equalRequest.expense,
					shareAllocations: [
						{ participantId: "participant_alvaro", shareAmountMinor: 8_000 },
						{ participantId: "participant_camila", shareAmountMinor: 4_000 },
					],
					splitMode: "custom",
				},
			}).success,
		).toBe(true);
	});

	it("treats participant IDs as share recipients rather than requiring the payer", () => {
		const externalPayerRequest = {
			...equalRequest,
			expense: {
				...equalRequest.expense,
				participantIds: ["participant_camila"],
			},
		};
		expect(CreateTelegramExpenseRequestSchema.safeParse(externalPayerRequest).success).toBe(true);
		expect(
			CreateTelegramExpenseRequestSchema.safeParse({
				...externalPayerRequest,
				expense: {
					...externalPayerRequest.expense,
					shareAllocations: [{ participantId: "participant_camila", shareAmountMinor: 12_000 }],
					splitMode: "custom",
				},
			}).success,
		).toBe(true);
	});

	it.each([
		["extra top-level field", { ...equalRequest, actorUserId: "user_alvaro" }],
		["non-canonical Telegram ID", { ...equalRequest, telegramUserId: "00123" }],
		["unsafe update ID", { ...equalRequest, updateId: Number.MAX_SAFE_INTEGER + 1 }],
		[
			"unsupported proof type",
			{ ...equalRequest, receipt: { ...receipt, contentType: "text/plain" } },
		],
		[
			"invalid calendar date",
			{ ...equalRequest, expense: { ...equalRequest.expense, expenseDate: "2026-02-30" } },
		],
		[
			"allocations on equal split",
			{
				...equalRequest,
				expense: {
					...equalRequest.expense,
					shareAllocations: [
						{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
						{ participantId: "participant_camila", shareAmountMinor: 6_000 },
					],
				},
			},
		],
		[
			"inexact custom total",
			{
				...equalRequest,
				expense: {
					...equalRequest.expense,
					shareAllocations: [
						{ participantId: "participant_alvaro", shareAmountMinor: 6_000 },
						{ participantId: "participant_camila", shareAmountMinor: 5_999 },
					],
					splitMode: "custom",
				},
			},
		],
		[
			"duplicate participants",
			{
				...equalRequest,
				expense: {
					...equalRequest.expense,
					participantIds: ["participant_alvaro", "participant_alvaro"],
				},
			},
		],
	])("rejects %s", (_case, request) => {
		expect(CreateTelegramExpenseRequestSchema.safeParse(request).success).toBe(false);
	});

	it("uses the same strict identity and receipt rules for lookup and repair", () => {
		expect(
			FindTelegramExpenseRequestSchema.safeParse({
				telegramUserId: "1099511627775",
				updateId: 0,
				version: 1,
			}).success,
		).toBe(true);
		expect(
			AttachTelegramExpenseReceiptRequestSchema.safeParse({
				receipt,
				telegramUserId: "123456789",
				updateId: 42,
				version: 1,
			}).success,
		).toBe(true);
		expect(
			FindTelegramExpenseRequestSchema.safeParse({
				telegramUserId: "123456789",
				unexpected: true,
				updateId: 42,
				version: 1,
			}).success,
		).toBe(false);
	});
});
