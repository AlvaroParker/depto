import type { ReceiptContentType } from "@/lib/const/receipts";

export interface ReceiptMetadata {
	objectKey: string;
	filename: string;
	contentType: ReceiptContentType;
	sizeBytes: number;
}
