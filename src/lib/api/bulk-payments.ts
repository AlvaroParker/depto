import { Err, Ok, type Result } from "ts-results";
import { apiRequest } from "@/lib/api/client";
import type { ApiError } from "@/lib/types/api";
import type { BulkPaymentResponse } from "@/lib/types/bulk-payment";

function parsePayload(request: XMLHttpRequest): unknown {
	try {
		return JSON.parse(request.responseText);
	} catch {
		return null;
	}
}

export function payAllDebt(
	paidToParticipantId: string,
	file?: File | null,
	onProgress?: (percent: number) => void,
): Promise<Result<BulkPaymentResponse, ApiError>> {
	const path = `/api/reimbursements/pay-all/${encodeURIComponent(paidToParticipantId)}`;
	if (!file) return apiRequest<BulkPaymentResponse>(path, { method: "POST" });
	return new Promise((resolve) => {
		const request = new XMLHttpRequest();
		request.open("POST", path);
		request.setRequestHeader("content-type", file.type);
		request.setRequestHeader("x-receipt-filename", encodeURIComponent(file.name));
		request.setRequestHeader("x-receipt-size", String(file.size));
		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
		});
		request.addEventListener("load", () => {
			const payload = parsePayload(request);
			if (request.status >= 200 && request.status < 300) {
				resolve(Ok(payload as BulkPaymentResponse));
				return;
			}
			resolve(
				Err(
					typeof payload === "object" && payload && "message" in payload
						? (payload as ApiError)
						: { message: "No pudimos registrar el pago." },
				),
			);
		});
		request.addEventListener("error", () =>
			resolve(Err({ message: "Se perdió la conexión durante la carga." })),
		);
		request.send(file);
	});
}
