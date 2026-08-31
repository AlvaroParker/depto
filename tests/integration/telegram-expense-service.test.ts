import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findExpenseReceipt } from "@/lib/db/receipts";
import { reserveMcpIdempotencyRecord } from "@/lib/db/mcp-idempotency";
import {
	attachTelegramExpenseReceipt,
	createTelegramExpense,
	findTelegramExpense,
	type TelegramExpenseServiceDependencies,
} from "@/lib/telegram/expense-service";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = "2026-08-31T12:00:00.000Z";
const RECEIPT_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function receiptStream(bytes: Uint8Array = RECEIPT_BYTES): ReadableStream<Uint8Array> {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	const stream = new Response(buffer).body;
	if (!stream) throw new Error("Expected a receipt stream.");
	return stream;
}

function cancellableReceiptStream(): {
	stream: ReadableStream<Uint8Array>;
	wasCancelled: () => boolean;
} {
	let cancelled = false;
	return {
		stream: new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
		}),
		wasCancelled: () => cancelled,
	};
}

function createRequest(updateId = 42) {
	return {
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
		receipt: {
			contentType: "image/jpeg",
			filename: "boleta.jpg",
			sizeBytes: RECEIPT_BYTES.byteLength,
		},
		telegramUserId: "111111",
		updateId,
		version: 1,
	} as const;
}

describe("Telegram expense application service", () => {
	let bindings: TestBindings;
	let dependencies: TelegramExpenseServiceDependencies;
	let emailCalls: Array<{ headers: Headers; payload: unknown }>;

	beforeEach(async () => {
		bindings = await createTestBindings();
		emailCalls = [];
		const fetcher: typeof fetch = async (_input, init) => {
			emailCalls.push({
				headers: new Headers(init?.headers),
				payload: JSON.parse(String(init?.body)),
			});
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		};
		dependencies = {
			appBaseUrl: "https://depto.parker.ci",
			database: bindings.database,
			fetcher,
			receipts: bindings.receipts,
			resendApiKey: "test-resend-key",
			resendFromEmail: "La cuenta <info@depto.parker.ci>",
		};
		await bindings.database.batch([
			bindings.database.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role,
				  telegram_user_id, created_at, updated_at)
				 VALUES ('user_alvaro', 'alvaro', 'hash', 'Alvaro', 'participant_alvaro', 'user',
				         '111111', '${NOW}', '${NOW}')`,
			),
			bindings.database.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role,
				  telegram_user_id, created_at, updated_at)
				 VALUES ('user_camila', 'camila', 'hash', 'Camila', 'participant_camila', 'user',
				         '222222', '${NOW}', '${NOW}')`,
			),
			bindings.database
				.prepare("UPDATE participants SET email = ? WHERE id = ?")
				.bind("alvaro@example.com", "participant_alvaro"),
			bindings.database
				.prepare("UPDATE participants SET email = ? WHERE id = ?")
				.bind("camila@example.com", "participant_camila"),
		]);
	});

	afterEach(async () => bindings.dispose());

	it("creates one receipt-backed expense and deterministically replays it", async () => {
		expect(
			await findTelegramExpense(
				{ telegramUserId: "111111", updateId: 42, version: 1 },
				dependencies,
			),
		).toEqual({ kind: "not_found", version: 1 });

		const created = await createTelegramExpense(createRequest(), receiptStream(), dependencies);
		expect(created).toMatchObject({
			expense: {
				amountMinor: 12_000,
				hasReceipt: true,
				payer: { id: "participant_alvaro", name: "Alvaro" },
				shares: [
					{ participant: { id: "participant_alvaro" }, shareAmountMinor: 6_000 },
					{ participant: { id: "participant_camila" }, shareAmountMinor: 6_000 },
				],
			},
			kind: "created",
			notification: "sent",
			receipt: "attached",
			version: 1,
		});
		if (!("expense" in created)) throw new Error("Expected a created expense.");
		expect(emailCalls).toHaveLength(1);
		expect(emailCalls[0]?.headers.get("Idempotency-Key")).toBe(
			`expense-created/${created.expense.id}`,
		);
		expect(emailCalls[0]?.payload).toHaveLength(2);

		const replayed = await createTelegramExpense(createRequest(), receiptStream(), dependencies);
		expect(replayed).toMatchObject({
			expense: { id: created.expense.id, hasReceipt: true },
			kind: "replayed",
			notification: "not_sent",
			receipt: "already_attached",
			version: 1,
		});
		expect(emailCalls).toHaveLength(1);
		expect(
			await findTelegramExpense(
				{ telegramUserId: "111111", updateId: 42, version: 1 },
				dependencies,
			),
		).toMatchObject({ expense: { id: created.expense.id, hasReceipt: true }, kind: "found" });
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});

	it("rejects changed data under the same Telegram update", async () => {
		const created = await createTelegramExpense(createRequest(), receiptStream(), dependencies);
		expect(created.kind).toBe("created");
		const unusedReceipt = cancellableReceiptStream();
		const conflict = await createTelegramExpense(
			{
				...createRequest(),
				expense: { ...createRequest().expense, amountMinor: 13_000 },
			},
			unusedReceipt.stream,
			dependencies,
		);
		expect(conflict).toEqual({ kind: "idempotency_conflict", version: 1 });
		expect(unusedReceipt.wasCancelled()).toBe(true);
	});

	it("repairs a missing receipt without rerunning creation or notifications", async () => {
		const failed = await createTelegramExpense(
			{
				...createRequest(77),
				receipt: { ...createRequest().receipt, contentType: "image/png" },
			},
			receiptStream(),
			dependencies,
		);
		expect(failed).toMatchObject({
			expense: { hasReceipt: false },
			kind: "created",
			notification: "sent",
			receipt: "failed",
		});
		if (!("expense" in failed)) throw new Error("Expected a created expense.");
		expect((await findExpenseReceipt(failed.expense.id, bindings.database)).val).toBeNull();
		expect((await bindings.receipts.list()).objects).toHaveLength(0);

		const repaired = await attachTelegramExpenseReceipt(
			{
				receipt: createRequest().receipt,
				telegramUserId: "111111",
				updateId: 77,
				version: 1,
			},
			receiptStream(),
			dependencies,
		);
		expect(repaired).toMatchObject({
			expense: { id: failed.expense.id, hasReceipt: true },
			kind: "attached",
			version: 1,
		});
		const repeated = await attachTelegramExpenseReceipt(
			{
				receipt: createRequest().receipt,
				telegramUserId: "111111",
				updateId: 77,
				version: 1,
			},
			receiptStream(),
			dependencies,
		);
		expect(repeated).toMatchObject({ kind: "already_attached", version: 1 });
		expect((await bindings.receipts.list()).objects).toHaveLength(1);
		expect(emailCalls).toHaveLength(1);
	});

	it("supports exact custom shares and scopes equal update IDs to the resolved user", async () => {
		const custom = createRequest(88);
		const alvaro = await createTelegramExpense(
			{
				...custom,
				expense: {
					...custom.expense,
					paidByParticipantId: "participant_trinidad",
					shareAllocations: [
						{ participantId: "participant_alvaro", shareAmountMinor: 8_000 },
						{ participantId: "participant_camila", shareAmountMinor: 4_000 },
					],
					splitMode: "custom",
				},
			},
			receiptStream(),
			dependencies,
		);
		expect(alvaro).toMatchObject({
			expense: {
				payer: { id: "participant_trinidad" },
				shares: [
					{
						participant: { id: "participant_alvaro" },
						shareAmountMinor: 8_000,
						status: "pending",
					},
					{
						participant: { id: "participant_camila" },
						shareAmountMinor: 4_000,
						status: "pending",
					},
				],
			},
			kind: "created",
		});

		const camila = await createTelegramExpense(
			{
				...createRequest(88),
				telegramUserId: "222222",
			},
			receiptStream(),
			dependencies,
		);
		expect(camila.kind).toBe("created");
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(count?.count).toBe(2);
	});

	it("revalidates active account state and preserves legacy in-progress outcomes", async () => {
		expect(
			await createTelegramExpense(
				{ ...createRequest(), telegramUserId: "999999" },
				receiptStream(),
				dependencies,
			),
		).toEqual({ kind: "unauthorized", version: 1 });
		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = ? WHERE id = 'user_alvaro'")
			.bind(NOW)
			.run();
		expect(
			await findTelegramExpense(
				{ telegramUserId: "111111", updateId: 42, version: 1 },
				dependencies,
			),
		).toEqual({ kind: "unauthorized", version: 1 });

		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = NULL WHERE id = 'user_alvaro'")
			.run();
		await reserveMcpIdempotencyRecord(
			{
				idempotencyKey: "telegram-update/99",
				requestHash: "legacy-hash",
				toolName: "telegram_create_expense",
				userId: "user_alvaro",
			},
			bindings.database,
		);
		expect(
			await findTelegramExpense(
				{ telegramUserId: "111111", updateId: 99, version: 1 },
				dependencies,
			),
		).toEqual({ kind: "in_progress", version: 1 });
	});

	it("rejects invalid categories and malformed commands without database writes", async () => {
		const malformedReceipt = cancellableReceiptStream();
		expect(await createTelegramExpense({}, malformedReceipt.stream, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
		expect(malformedReceipt.wasCancelled()).toBe(true);
		const invalidKindReceipt = cancellableReceiptStream();
		expect(
			await createTelegramExpense(
				{
					...createRequest(),
					expense: { ...createRequest().expense, kindId: "missing-kind" },
				},
				invalidKindReceipt.stream,
				dependencies,
			),
		).toEqual({ kind: "invalid_request", version: 1 });
		expect(invalidKindReceipt.wasCancelled()).toBe(true);
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM expenses")
			.first<{ count: number }>();
		expect(count?.count).toBe(0);
	});

	it("cancels receipt-repair streams when no expense can receive them", async () => {
		const malformedReceipt = cancellableReceiptStream();
		expect(await attachTelegramExpenseReceipt({}, malformedReceipt.stream, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
		expect(malformedReceipt.wasCancelled()).toBe(true);

		const missingReceipt = cancellableReceiptStream();
		expect(
			await attachTelegramExpenseReceipt(
				{
					receipt: createRequest().receipt,
					telegramUserId: "111111",
					updateId: 404,
					version: 1,
				},
				missingReceipt.stream,
				dependencies,
			),
		).toEqual({ kind: "not_found", version: 1 });
		expect(missingReceipt.wasCancelled()).toBe(true);
	});

	it("fails closed when persisted data cannot fit the v1 summary contract", async () => {
		const created = await createTelegramExpense(createRequest(123), receiptStream(), dependencies);
		if (!("expense" in created)) throw new Error("Expected a created expense.");
		await bindings.database
			.prepare("UPDATE expenses SET split_mode = 'open' WHERE id = ?")
			.bind(created.expense.id)
			.run();
		expect(
			await findTelegramExpense(
				{ telegramUserId: "111111", updateId: 123, version: 1 },
				dependencies,
			),
		).toEqual({ kind: "storage_error", version: 1 });
	});
});
