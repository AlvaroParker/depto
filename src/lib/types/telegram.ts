import { z } from "zod";

export const TELEGRAM_USER_ID_MAX = "1099511627775";

const telegramUserIdSchema = z
	.string({ error: "Ingresa un ID numérico de Telegram válido." })
	.trim()
	.refine(
		(value) => /^[1-9][0-9]{0,12}$/.test(value) && BigInt(value) <= BigInt(TELEGRAM_USER_ID_MAX),
		"Ingresa un ID numérico de Telegram válido.",
	);

export const TelegramUserIdInputSchema = z
	.object({
		telegramUserId: telegramUserIdSchema,
	})
	.strict();

export interface TelegramUserIdInput extends z.infer<typeof TelegramUserIdInputSchema> {
	telegramUserId: string;
}

export interface TelegramUserIdResponse {
	telegramUserId: string;
}
