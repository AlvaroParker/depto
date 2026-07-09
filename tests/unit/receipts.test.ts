import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_SIZE_BYTES } from "@/lib/const/receipts";
import {
	createReceiptObjectKey,
	receiptContentDisposition,
	sanitizeReceiptFilename,
	validateReceiptMetadata,
} from "@/lib/util/receipts";

describe("receipt metadata", () => {
	it.each(["image/jpeg", "image/png", "image/webp", "application/pdf"])(
		"accepts %s through the 10 MB boundary",
		(contentType) => {
			expect(
				validateReceiptMetadata({
					contentType,
					filename: "boleta julio.pdf",
					sizeBytes: MAX_RECEIPT_SIZE_BYTES,
				}),
			).toMatchObject({ contentType, filename: "boleta julio.pdf" });
		},
	);
	it("rejects unsupported, empty, and oversized files", () => {
		expect(() =>
			validateReceiptMetadata({ contentType: "text/plain", filename: "x.txt", sizeBytes: 10 }),
		).toThrow(/JPG/);
		expect(() =>
			validateReceiptMetadata({ contentType: "image/png", filename: "x.png", sizeBytes: 0 }),
		).toThrow(/vacío/);
		expect(() =>
			validateReceiptMetadata({
				contentType: "image/png",
				filename: "x.png",
				sizeBytes: MAX_RECEIPT_SIZE_BYTES + 1,
			}),
		).toThrow(/10 MB/);
	});
	it("removes paths and control characters from filenames", () => {
		expect(sanitizeReceiptFilename("../carpeta/\u0000boleta.pdf")).toBe("boleta.pdf");
		expect(receiptContentDisposition("boleta julio.pdf")).not.toContain("\n");
	});
	it("creates opaque type-correct keys scoped to an expense", () => {
		const first = createReceiptObjectKey("expense-1", "image/png");
		const second = createReceiptObjectKey("expense-1", "image/png");
		expect(first).toMatch(/^receipts\/expense-1\/[0-9a-f-]+\.png$/);
		expect(second).not.toBe(first);
	});
});
