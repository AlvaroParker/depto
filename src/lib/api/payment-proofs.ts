import { Err, Ok, type Result } from "ts-results";
import type { ApiError } from "@/lib/types/api";
import type { ExpenseShare } from "@/lib/types/expense";

export function uploadPaymentProof(
	shareId: string,
	file: File,
	onProgress?: (percent: number) => void,
): Promise<Result<ExpenseShare, ApiError>> {
	return new Promise((resolve) => {
		const request = new XMLHttpRequest();
		request.open("PUT", `/api/expense-shares/${shareId}/proof`);
		request.setRequestHeader("content-type", file.type);
		request.setRequestHeader("x-receipt-filename", encodeURIComponent(file.name));
		request.setRequestHeader("x-receipt-size", String(file.size));
		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
		});
		request.addEventListener("load", () => {
			let payload: unknown;
			try {
				payload = JSON.parse(request.responseText);
			} catch {
				payload = null;
			}
			if (request.status >= 200 && request.status < 300) {
				resolve(Ok(payload as ExpenseShare));
				return;
			}
			resolve(
				Err(
					typeof payload === "object" && payload && "message" in payload
						? (payload as ApiError)
						: { message: "No pudimos subir el comprobante de pago." },
				),
			);
		});
		request.addEventListener("error", () =>
			resolve(Err({ message: "Se perdió la conexión durante la carga." })),
		);
		request.send(file);
	});
}
