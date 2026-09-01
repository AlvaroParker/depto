"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import { uploadReceipt } from "@/lib/api/receipts";

export function ReceiptField({ expenseId }: { expenseId: string }) {
	const router = useRouter();
	const input = useRef<HTMLInputElement>(null);
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
			<input
				accept={RECEIPT_CONTENT_TYPES.join(",")}
				aria-hidden="true"
				className="sr-only"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					void select(file);
				}}
				ref={input}
				tabIndex={-1}
				type="file"
			/>
			<Button
				aria-busy={progress !== null}
				disabled={progress !== null}
				onClick={() => input.current?.click()}
				variant="secondary"
			>
				{progress !== null ? (
					<LoaderCircle aria-hidden className="animate-spin" size={17} />
				) : (
					<FileUp aria-hidden size={17} />
				)}
				{progress !== null ? `Subiendo ${progress}%` : "Subir comprobante"}
			</Button>
			<p aria-live="polite" className="sr-only" role="status">
				{progress !== null ? `Subiendo comprobante: ${progress}%` : ""}
			</p>
			{error ? (
				<p className="text-danger mt-2 text-sm" role="alert">
					{error}
				</p>
			) : (
				<p className="text-ink-faint mt-2 text-xs">JPG, PNG, WebP o PDF · máximo 10 MB</p>
			)}
		</div>
	);
}
