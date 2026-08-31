import { apiRequest, type ApiResult } from "@/lib/api/client";
import type { TelegramUserIdInput, TelegramUserIdResponse } from "@/lib/types/telegram";

const TELEGRAM_PROFILE_PATH = "/api/profile/telegram";

export function saveTelegramUserId(
	input: TelegramUserIdInput,
): Promise<ApiResult<TelegramUserIdResponse>> {
	return apiRequest<TelegramUserIdResponse>(TELEGRAM_PROFILE_PATH, {
		body: JSON.stringify(input),
		method: "PUT",
	});
}

export function removeTelegramUserId(): Promise<ApiResult<null>> {
	return apiRequest<null>(TELEGRAM_PROFILE_PATH, { method: "DELETE" });
}
