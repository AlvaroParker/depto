import { Err, Ok } from "ts-results";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptMetadata } from "@/lib/types/receipt";

const receiptMocks = vi.hoisted(() => ({
	attachExpenseReceipt: vi.fn(),
	attachExpenseReceiptIfMissing: vi.fn(),
	findExpenseReceipt: vi.fn(),
}));

vi.mock("@/lib/db/receipts", () => receiptMocks);

import { attachReceiptStreamIfMissing } from "@/lib/services/files";

const RECEIPT_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function receiptStream(): ReadableStream<Uint8Array> {
	const stream = new Response(RECEIPT_BYTES).body;
	if (!stream) throw new Error("Expected a receipt stream.");
	return stream;
}

describe("streamed receipt storage reconciliation", () => {
	const database = {} as D1Database;
	const put = vi.fn();
	const remove = vi.fn();
	const receipts = { delete: remove, put } as unknown as R2Bucket;

	beforeEach(() => {
		vi.clearAllMocks();
		put.mockResolvedValue(undefined);
		remove.mockResolvedValue(undefined);
	});

	it("retains the object when a failed D1 response committed its receipt metadata", async () => {
		let committedReceipt: ReceiptMetadata | null = null;
		receiptMocks.findExpenseReceipt.mockImplementation(() => Promise.resolve(Ok(committedReceipt)));
		receiptMocks.attachExpenseReceiptIfMissing.mockImplementation(
			(_expenseId: string, receipt: ReceiptMetadata) => {
				committedReceipt = receipt;
				return Promise.resolve(Err({ cause: new Error("response lost"), kind: "database" }));
			},
		);

		await expect(
			attachReceiptStreamIfMissing(
				"expense-1",
				{ contentType: "image/jpeg", filename: "boleta.jpg", sizeBytes: 4 },
				receiptStream(),
				{ database, receipts },
			),
		).resolves.toEqual({ kind: "attached" });

		const retainedReceipt = receiptMocks.attachExpenseReceiptIfMissing.mock.calls[0]?.[1] as
			ReceiptMetadata | undefined;
		expect(receiptMocks.findExpenseReceipt).toHaveBeenCalledTimes(2);
		expect(retainedReceipt?.objectKey).toMatch(/^receipts\/expense-1\/.+\.jpg$/);
		expect(put).toHaveBeenCalledWith(
			retainedReceipt?.objectKey,
			RECEIPT_BYTES,
			expect.objectContaining({ httpMetadata: { contentType: "image/jpeg" } }),
		);
		expect(remove).not.toHaveBeenCalled();
	});

	it("deletes the object when reconciliation cannot find its key", async () => {
		receiptMocks.findExpenseReceipt.mockResolvedValue(Ok(null));
		receiptMocks.attachExpenseReceiptIfMissing.mockResolvedValue(
			Err({ cause: new Error("write failed"), kind: "database" }),
		);

		await expect(
			attachReceiptStreamIfMissing(
				"expense-2",
				{ contentType: "image/jpeg", filename: "boleta.jpg", sizeBytes: 4 },
				receiptStream(),
				{ database, receipts },
			),
		).resolves.toEqual({ kind: "failed" });

		const objectKey = put.mock.calls[0]?.[0] as string;
		expect(receiptMocks.findExpenseReceipt).toHaveBeenCalledTimes(2);
		expect(remove).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledWith(objectKey);
	});

	it("retains the object when the reconciliation read also fails", async () => {
		receiptMocks.findExpenseReceipt
			.mockResolvedValueOnce(Ok(null))
			.mockResolvedValueOnce(Err({ cause: new Error("read failed"), kind: "database" }));
		receiptMocks.attachExpenseReceiptIfMissing.mockResolvedValue(
			Err({ cause: new Error("ambiguous write"), kind: "database" }),
		);

		await expect(
			attachReceiptStreamIfMissing(
				"expense-3",
				{ contentType: "image/jpeg", filename: "boleta.jpg", sizeBytes: 4 },
				receiptStream(),
				{ database, receipts },
			),
		).resolves.toEqual({ kind: "failed" });

		expect(receiptMocks.findExpenseReceipt).toHaveBeenCalledTimes(2);
		expect(put).toHaveBeenCalledOnce();
		expect(remove).not.toHaveBeenCalled();
	});
});
