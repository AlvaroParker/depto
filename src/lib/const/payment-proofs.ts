export const MAX_PAYMENT_PROOF_SIZE_BYTES = 10 * 1024 * 1024;

export const PAYMENT_PROOF_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PaymentProofContentType = (typeof PAYMENT_PROOF_CONTENT_TYPES)[number];

export const PAYMENT_PROOF_EXTENSION_BY_TYPE: Record<PaymentProofContentType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
