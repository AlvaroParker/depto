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

export type ReceiptImageContentType = "image/jpeg" | "image/png" | "image/webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function matchesBytes(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
	return expected.every((value, index) => bytes[offset + index] === value);
}

export function validateReceiptImageSignature(
	bytes: Uint8Array,
	contentType: ReceiptImageContentType,
): void {
	const valid =
		contentType === "image/jpeg"
			? bytes.length >= 3 && matchesBytes(bytes, [0xff, 0xd8, 0xff])
			: contentType === "image/png"
				? bytes.length >= PNG_SIGNATURE.length && matchesBytes(bytes, PNG_SIGNATURE)
				: bytes.length >= 12 &&
					matchesBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
					matchesBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8);
	if (!valid) throw new Error("El contenido del comprobante no coincide con el tipo de imagen.");
}

function validateReceiptPdfSignature(bytes: Uint8Array): void {
	const header = new TextDecoder("ascii").decode(bytes.subarray(0, 8));
	const tail = new TextDecoder("ascii").decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
	if (!/^%PDF-(?:1\.[0-9]|2\.0)/.test(header) || !/%%EOF[\t\n\f\r ]*$/.test(tail)) {
		throw new Error("El contenido del comprobante no coincide con un archivo PDF válido.");
	}
}

export function validateReceiptSignature(bytes: Uint8Array, contentType: ReceiptContentType): void {
	if (contentType === "application/pdf") {
		validateReceiptPdfSignature(bytes);
		return;
	}
	validateReceiptImageSignature(bytes, contentType);
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
