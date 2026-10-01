"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AttachmentInput } from "@/components/ui/attachment-input";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import { uploadReceipt } from "@/lib/api/receipts";

export function ReceiptField({ expenseId }: { expenseId: string }) {
	const router = useRouter();
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState("");
	async function select(file: File | undefined) {
		if (!file) return;
		setError("");
		if (!RECEIPT_CONTENT_TYPES.includes(file.type as never)) {
			setError("Usa un archivo JPG, PNG, WebP o PDF.");
			return;
		}
		if (file.size > MAX_RECEIPT_SIZE_BYTES) {
			setError("El comprobante no puede superar 10 MB.");
			return;
		}
		if (file.size < 1) {
			setError("El comprobante está vacío.");
			return;
		}
		setProgress(0);
		const result = await uploadReceipt(expenseId, file, setProgress);
		setProgress(null);
		if (result.err) {
			setError(result.val.message);
			return;
		}
		router.refresh();
	}
	return (
		<div>
			<AttachmentInput
				accept={RECEIPT_CONTENT_TYPES}
				chooseLabel={progress !== null ? `Subiendo ${progress}%` : "Subir comprobante"}
				disabled={progress !== null}
				hint="JPG, PNG, WebP o PDF · máximo 10 MB"
				label="Comprobante"
				onChange={(file) => void select(file)}
			/>
			<p aria-live="polite" className="sr-only" role="status">
				{progress !== null ? `Subiendo comprobante: ${progress}%` : ""}
			</p>
			{error ? (
				<p className="text-danger mt-2 text-sm" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
