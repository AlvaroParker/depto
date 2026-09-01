import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	acknowledgeTelegramPrivacyNotice,
	getTelegramPrivacyNoticeState,
	type TelegramConversationServiceDependencies,
} from "@/lib/telegram/conversation-service";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = "2026-09-01T12:00:00.000Z";
const actorRequest = { telegramUserId: "111111", version: 1 } as const;

describe("Telegram privacy notice service", () => {
	let bindings: TestBindings;
	let dependencies: TelegramConversationServiceDependencies;

	beforeEach(async () => {
		bindings = await createTestBindings();
		dependencies = { database: bindings.database };
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role,
				  telegram_user_id, created_at, updated_at)
				 VALUES ('user_alvaro', 'alvaro', 'hash', 'Alvaro', 'participant_alvaro',
				         'user', '111111', ?, ?)`,
			)
			.bind(NOW, NOW)
			.run();
	});

	afterEach(async () => bindings.dispose());

	it("requires the current notice for a newly migrated account", async () => {
		expect(await getTelegramPrivacyNoticeState(actorRequest, dependencies)).toEqual({
			data: {
				acknowledgedVersion: 0,
				currentVersion: 1,
				required: true,
			},
			kind: "ok",
			version: 1,
		});
	});

	it("acknowledges idempotently and never lowers a newer stored version", async () => {
		const request = { ...actorRequest, noticeVersion: 1 } as const;
		expect(await acknowledgeTelegramPrivacyNotice(request, dependencies)).toEqual({
			data: {
				acknowledgedVersion: 1,
				currentVersion: 1,
				required: false,
			},
			kind: "ok",
			version: 1,
		});
		await bindings.database
			.prepare("UPDATE app_users SET updated_at = ? WHERE id = 'user_alvaro'")
			.bind(NOW)
			.run();
		expect(await acknowledgeTelegramPrivacyNotice(request, dependencies)).toMatchObject({
			data: { acknowledgedVersion: 1, required: false },
			kind: "ok",
		});
		const idempotentTimestamp = await bindings.database
			.prepare("SELECT updated_at FROM app_users WHERE id = 'user_alvaro'")
			.first<{ updated_at: string }>();
		expect(idempotentTimestamp?.updated_at).toBe(NOW);

		await bindings.database
			.prepare("UPDATE app_users SET telegram_privacy_notice_version = 3 WHERE id = 'user_alvaro'")
			.run();
		expect(await acknowledgeTelegramPrivacyNotice(request, dependencies)).toMatchObject({
			data: { acknowledgedVersion: 3, currentVersion: 1, required: false },
			kind: "ok",
		});
	});

	it("reauthorizes the active Telegram account for every privacy operation", async () => {
		expect(
			await getTelegramPrivacyNoticeState({ telegramUserId: "999999", version: 1 }, dependencies),
		).toEqual({ kind: "unauthorized", version: 1 });

		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = ? WHERE id = 'user_alvaro'")
			.bind(NOW)
			.run();
		expect(await getTelegramPrivacyNoticeState(actorRequest, dependencies)).toEqual({
			kind: "unauthorized",
			version: 1,
		});
		expect(
			await acknowledgeTelegramPrivacyNotice({ ...actorRequest, noticeVersion: 1 }, dependencies),
		).toEqual({ kind: "unauthorized", version: 1 });
	});

	it("rejects malformed requests before accessing privacy state", async () => {
		expect(await getTelegramPrivacyNoticeState({}, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
		expect(
			await acknowledgeTelegramPrivacyNotice({ ...actorRequest, noticeVersion: 2 }, dependencies),
		).toEqual({ kind: "invalid_request", version: 1 });
	});

	it("maps database failures to the stable storage error", async () => {
		const brokenDependencies = {
			database: {
				prepare() {
					throw new Error("database unavailable");
				},
			} as unknown as D1Database,
		};

		expect(await getTelegramPrivacyNoticeState(actorRequest, brokenDependencies)).toEqual({
			kind: "storage_error",
			version: 1,
		});
		expect(
			await acknowledgeTelegramPrivacyNotice(
				{ ...actorRequest, noticeVersion: 1 },
				brokenDependencies,
			),
		).toEqual({ kind: "storage_error", version: 1 });
	});
});
