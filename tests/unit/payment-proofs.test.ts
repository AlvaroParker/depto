import { describe, expect, it } from "vitest";
import { MAX_PAYMENT_PROOF_SIZE_BYTES } from "@/lib/const/payment-proofs";
import {
	createPaymentProofObjectKey,
	validatePaymentProofMetadata,
} from "@/lib/util/payment-proofs";

describe("payment proof metadata", () => {
	it.each(["image/jpeg", "image/png", "image/webp"])(
		"accepts %s through the 10 MB boundary",
		(contentType) => {
			expect(
				validatePaymentProofMetadata({
					contentType,
					filename: "transferencia julio.png",
					sizeBytes: MAX_PAYMENT_PROOF_SIZE_BYTES,
				}),
			).toMatchObject({ contentType, filename: "transferencia julio.png" });
		},
	);

	it("rejects PDFs, empty files, and oversized images", () => {
		expect(() =>
			validatePaymentProofMetadata({
				contentType: "application/pdf",
				filename: "transferencia.pdf",
				sizeBytes: 10,
			}),
		).toThrow(/JPG/);
		expect(() =>
			validatePaymentProofMetadata({
				contentType: "image/png",
				filename: "transferencia.png",
				sizeBytes: 0,
			}),
		).toThrow(/vacío/);
		expect(() =>
			validatePaymentProofMetadata({
				contentType: "image/png",
				filename: "transferencia.png",
				sizeBytes: MAX_PAYMENT_PROOF_SIZE_BYTES + 1,
			}),
		).toThrow(/10 MB/);
	});

	it("creates opaque image keys scoped to the share", () => {
		const first = createPaymentProofObjectKey("share-1", "image/png");
		const second = createPaymentProofObjectKey("share-1", "image/png");
		expect(first).toMatch(/^payment-proofs\/share-1\/[0-9a-f-]+\.png$/);
		expect(second).not.toBe(first);
	});
});
