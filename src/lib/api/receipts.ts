import { Err, Ok, type Result } from "ts-results";
import type { ApiError } from "@/lib/types/api";
import type { ExpenseDetail } from "@/lib/types/expense";

export function uploadReceipt(
	expenseId: string,
	file: File,
	onProgress?: (percent: number) => void,
): Promise<Result<ExpenseDetail, ApiError>> {
	return new Promise((resolve) => {
		const request = new XMLHttpRequest();
		request.open("PUT", `/api/expenses/${expenseId}/receipt`);
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
			if (request.status >= 200 && request.status < 300) resolve(Ok(payload as ExpenseDetail));
			else
				resolve(
					Err(
						typeof payload === "object" && payload && "message" in payload
							? (payload as ApiError)
							: { message: "No pudimos subir el comprobante." },
					),
				);
		});
		request.addEventListener("error", () =>
			resolve(Err({ message: "Se perdió la conexión durante la carga." })),
		);
		request.send(file);
	});
}
