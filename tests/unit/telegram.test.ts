import { describe, expect, it } from "vitest";
import { TelegramUserIdInputSchema } from "@/lib/types/telegram";

describe("Telegram user ID validation", () => {
	it.each([
		["1", "1"],
		[" 123456789 ", "123456789"],
		["1099511627775", "1099511627775"],
	])("accepts and canonicalizes %j", (input, expected) => {
		expect(TelegramUserIdInputSchema.parse({ telegramUserId: input })).toEqual({
			telegramUserId: expected,
		});
	});

	it.each([
		"",
		"   ",
		"0",
		"00",
		"01",
		"-1",
		"+1",
		"1.0",
		"1e3",
		"@telegram_user",
		"telegram_user",
		"1 2",
		"١٢٣",
		"１２３",
		"1099511627776",
		"99999999999999",
	])("rejects the non-canonical or out-of-range value %j", (telegramUserId) => {
		const parsed = TelegramUserIdInputSchema.safeParse({ telegramUserId });
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.flatten().fieldErrors.telegramUserId).toEqual([
				"Ingresa un ID numérico de Telegram válido.",
			]);
		}
	});

	it.each([null, undefined, 123, 123n, true])("rejects the non-string value %s", (value) => {
		const parsed = TelegramUserIdInputSchema.safeParse({ telegramUserId: value });
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.flatten().fieldErrors.telegramUserId).toEqual([
				"Ingresa un ID numérico de Telegram válido.",
			]);
		}
	});
});
