export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

export const RECEIPT_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;

export type ReceiptContentType = (typeof RECEIPT_CONTENT_TYPES)[number];

export const RECEIPT_EXTENSION_BY_TYPE: Record<ReceiptContentType, string> = {
	"application/pdf": "pdf",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
