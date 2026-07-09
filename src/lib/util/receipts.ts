import {
	MAX_RECEIPT_SIZE_BYTES,
	RECEIPT_CONTENT_TYPES,
	RECEIPT_EXTENSION_BY_TYPE,
	type ReceiptContentType,
} from "@/lib/const/receipts";
import type { ReceiptMetadata } from "@/lib/types/receipt";
import { createId } from "@/lib/util/ids";

export interface ReceiptValidationInput {
	contentType: string;
	filename: string;
	sizeBytes: number;
}

export function sanitizeReceiptFilename(filename: string): string {
	const basename = filename.split(/[\\/]/).at(-1) ?? "";
	return basename
		.normalize("NFC")
		.replaceAll(/[\u0000-\u001f\u007f]/g, "")
		.trim()
		.slice(0, 255);
}

export function validateReceiptMetadata(
	input: ReceiptValidationInput,
): Omit<ReceiptMetadata, "objectKey"> {
	const filename = sanitizeReceiptFilename(input.filename);
	if (!filename) throw new Error("El nombre del comprobante no es válido.");
	if (!RECEIPT_CONTENT_TYPES.includes(input.contentType as ReceiptContentType)) {
		throw new Error("Usa un archivo JPG, PNG, WebP o PDF.");
	}
	if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
		throw new Error("El comprobante está vacío o su tamaño no es válido.");
	}
	if (input.sizeBytes > MAX_RECEIPT_SIZE_BYTES) {
		throw new Error("El comprobante no puede superar 10 MB.");
	}
	return {
		contentType: input.contentType as ReceiptContentType,
		filename,
		sizeBytes: input.sizeBytes,
	};
}

export function createReceiptObjectKey(expenseId: string, contentType: ReceiptContentType): string {
	return `receipts/${encodeURIComponent(expenseId)}/${createId()}.${RECEIPT_EXTENSION_BY_TYPE[contentType]}`;
}

export function receiptContentDisposition(filename: string): string {
	const ascii = filename.replaceAll(/[^\x20-\x7e]/g, "_").replaceAll(/["\\]/g, "_");
	return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
