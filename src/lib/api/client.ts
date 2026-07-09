import { Err, Ok, type Result } from "ts-results";
import type { ApiError } from "@/lib/types/api";

export type ApiResult<T> = Result<T, ApiError>;

function isApiError(value: unknown): value is ApiError {
	return (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof value.message === "string"
	);
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
	try {
		const response = await fetch(path, {
			...init,
			credentials: "same-origin",
			headers: {
				...(init?.body && !(init.body instanceof FormData)
					? { "content-type": "application/json" }
					: {}),
				...init?.headers,
			},
		});
		const payload: unknown = response.headers.get("content-type")?.includes("application/json")
			? await response.json()
			: null;
		if (!response.ok) {
			return Err(
				isApiError(payload)
					? payload
					: { message: "No pudimos completar la solicitud. Inténtalo nuevamente." },
			);
		}
		return Ok(payload as T);
	} catch {
		return Err({ message: "No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente." });
	}
}
