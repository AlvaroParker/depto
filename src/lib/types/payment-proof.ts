import type { PaymentProofContentType } from "@/lib/const/payment-proofs";

export interface PaymentProof {
	contentType: PaymentProofContentType;
	filename: string;
	sizeBytes: number;
	uploadedAt: string;
	uploadedByUserId: string;
}

export interface PaymentProofStorageMetadata {
	contentType: PaymentProofContentType;
	filename: string;
	objectKey: string;
	sizeBytes: number;
}

export interface StoredPaymentProof extends PaymentProof {
	objectKey: string;
}
