import {
	MAX_PAYMENT_PROOF_SIZE_BYTES,
	PAYMENT_PROOF_CONTENT_TYPES,
	PAYMENT_PROOF_EXTENSION_BY_TYPE,
	type PaymentProofContentType,
} from "@/lib/const/payment-proofs";
import type { PaymentProofStorageMetadata } from "@/lib/types/payment-proof";
import { sanitizeReceiptFilename } from "@/lib/util/receipts";
import { createId } from "@/lib/util/ids";

export interface PaymentProofValidationInput {
	contentType: string;
	filename: string;
	sizeBytes: number;
}

export function validatePaymentProofMetadata(
	input: PaymentProofValidationInput,
): Omit<PaymentProofStorageMetadata, "objectKey"> {
	const filename = sanitizeReceiptFilename(input.filename);
	if (!filename) throw new Error("El nombre del comprobante no es válido.");
	if (!PAYMENT_PROOF_CONTENT_TYPES.includes(input.contentType as PaymentProofContentType)) {
		throw new Error("Usa un archivo JPG, PNG o WebP.");
	}
	if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
		throw new Error("El comprobante está vacío o su tamaño no es válido.");
	}
	if (input.sizeBytes > MAX_PAYMENT_PROOF_SIZE_BYTES) {
		throw new Error("El comprobante no puede superar 10 MB.");
	}
	return {
		contentType: input.contentType as PaymentProofContentType,
		filename,
		sizeBytes: input.sizeBytes,
	};
}

export function createPaymentProofObjectKey(
	shareId: string,
	contentType: PaymentProofContentType,
): string {
	return `payment-proofs/${encodeURIComponent(shareId)}/${createId()}.${PAYMENT_PROOF_EXTENSION_BY_TYPE[contentType]}`;
}
