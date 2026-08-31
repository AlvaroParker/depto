import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: vi.fn(),
	database: null as D1Database | null,
}));

vi.mock("@/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/db/bindings", () => ({
	getBindings: () => ({ APP_BASE_URL: "https://expenses.example", DB: state.database }),
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import {
	DELETE as deleteTelegramUserId,
	PUT as putTelegramUserId,
} from "@/app/api/profile/telegram/route";
import {
	clearTelegramUserIdForUser,
	findTelegramUserIdForUser,
	setTelegramUserIdForUser,
} from "@/lib/db/telegram";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const CREATED_AT = "2026-08-31T12:00:00.000Z";
const TELEGRAM_URL = "https://expenses.example/api/profile/telegram";

function userSession(id = "user-alvaro", participantId = "participant_alvaro") {
	return {
		user: {
			displayName: "Alvaro",
			id,
			participantId,
			role: "user",
			username: "alvaro",
		},
	};
}

function putRequest(telegramUserId: unknown, headers?: HeadersInit): Request {
	return new Request(TELEGRAM_URL, {
		body: JSON.stringify({ telegramUserId }),
		headers,
		method: "PUT",
	});
}

describe("Telegram profile persistence and route", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.auth.mockReset();
		state.auth.mockResolvedValue(userSession());
		await bindings.database.batch([
			bindings.database
				.prepare(
					`INSERT INTO app_users
					 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
					 VALUES ('user-alvaro', 'alvaro', 'hash', 'Alvaro',
					 'participant_alvaro', 'user', ?, ?)`,
				)
				.bind(CREATED_AT, CREATED_AT),
			bindings.database
				.prepare(
					`INSERT INTO app_users
					 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
					 VALUES ('user-camila', 'camila', 'hash', 'Camila',
					 'participant_camila', 'user', ?, ?)`,
				)
				.bind(CREATED_AT, CREATED_AT),
		]);
	});

	afterEach(async () => {
		state.database = null;
		await bindings.dispose();
	});

	it("reads, sets, replaces, and idempotently clears the caller's value", async () => {
		const initial = await findTelegramUserIdForUser("user-alvaro", bindings.database);
		expect(initial.ok && initial.val).toEqual({ kind: "found", telegramUserId: null });

		const firstUpdate = new Date("2026-08-31T13:00:00.000Z");
		const created = await setTelegramUserIdForUser(
			"user-alvaro",
			"123456789",
			bindings.database,
			firstUpdate,
		);
		expect(created.ok && created.val).toEqual({
			kind: "updated",
			telegramUserId: "123456789",
		});

		const replacementUpdate = new Date("2026-08-31T14:00:00.000Z");
		const replaced = await setTelegramUserIdForUser(
			"user-alvaro",
			"1099511627775",
			bindings.database,
			replacementUpdate,
		);
		expect(replaced.ok && replaced.val).toEqual({
			kind: "updated",
			telegramUserId: "1099511627775",
		});
		expect((await findTelegramUserIdForUser("user-alvaro", bindings.database)).val).toEqual({
			kind: "found",
			telegramUserId: "1099511627775",
		});

		const sameValueUpdate = new Date("2026-08-31T15:00:00.000Z");
		const unchanged = await setTelegramUserIdForUser(
			"user-alvaro",
			"1099511627775",
			bindings.database,
			sameValueUpdate,
		);
		expect(unchanged.ok && unchanged.val.kind).toBe("updated");
		const afterSet = await bindings.database
			.prepare("SELECT updated_at FROM app_users WHERE id = 'user-alvaro'")
			.first<{ updated_at: string }>();
		expect(afterSet?.updated_at).toBe(sameValueUpdate.toISOString());

		const removalUpdate = new Date("2026-08-31T16:00:00.000Z");
		expect(
			(await clearTelegramUserIdForUser("user-alvaro", bindings.database, removalUpdate)).val,
		).toEqual({ kind: "cleared" });
		expect((await findTelegramUserIdForUser("user-alvaro", bindings.database)).val).toEqual({
			kind: "found",
			telegramUserId: null,
		});
		expect(
			(
				await clearTelegramUserIdForUser(
					"user-alvaro",
					bindings.database,
					new Date("2026-08-31T17:00:00.000Z"),
				)
			).val,
		).toEqual({ kind: "cleared" });
		const afterSecondClear = await bindings.database
			.prepare("SELECT updated_at FROM app_users WHERE id = 'user-alvaro'")
			.first<{ updated_at: string }>();
		expect(afterSecondClear?.updated_at).toBe(removalUpdate.toISOString());
	});

	it("retains disabled users' IDs and continues reserving them", async () => {
		await setTelegramUserIdForUser("user-camila", "987654321", bindings.database);
		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = ? WHERE id = 'user-camila'")
			.bind("2026-08-31T13:00:00.000Z")
			.run();

		const duplicate = await setTelegramUserIdForUser("user-alvaro", "987654321", bindings.database);
		expect(duplicate.ok && duplicate.val).toEqual({ kind: "telegram_user_id_taken" });
		expect((await findTelegramUserIdForUser("user-camila", bindings.database)).val).toEqual({
			kind: "not_found",
		});
		expect((await clearTelegramUserIdForUser("user-camila", bindings.database)).val).toEqual({
			kind: "not_found",
		});
		const stored = await bindings.database
			.prepare("SELECT telegram_user_id FROM app_users WHERE id = 'user-camila'")
			.first<{ telegram_user_id: string | null }>();
		expect(stored?.telegram_user_id).toBe("987654321");
	});

	it("returns explicit not-found outcomes for missing callers", async () => {
		expect((await findTelegramUserIdForUser("missing", bindings.database)).val).toEqual({
			kind: "not_found",
		});
		expect((await setTelegramUserIdForUser("missing", "123", bindings.database)).val).toEqual({
			kind: "not_found",
		});
		expect((await clearTelegramUserIdForUser("missing", bindings.database)).val).toEqual({
			kind: "not_found",
		});
	});

	it("saves a trimmed ID and supports idempotent removal through the route", async () => {
		const saved = await putTelegramUserId(putRequest(" 123456789 "));
		expect(saved.status).toBe(200);
		expect(await saved.json()).toEqual({ telegramUserId: "123456789" });

		const removed = await deleteTelegramUserId(new Request(TELEGRAM_URL, { method: "DELETE" }));
		expect(removed.status).toBe(204);
		const removedAgain = await deleteTelegramUserId(
			new Request(TELEGRAM_URL, { method: "DELETE" }),
		);
		expect(removedAgain.status).toBe(204);
	});

	it("returns field-level validation and duplicate ownership errors", async () => {
		const invalid = await putTelegramUserId(putRequest("@alvaro"));
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({
			code: "VALIDATION_ERROR",
			errors: { telegramUserId: ["Ingresa un ID numérico de Telegram válido."] },
		});

		await setTelegramUserIdForUser("user-camila", "555555", bindings.database);
		const duplicate = await putTelegramUserId(putRequest("555555"));
		expect(duplicate.status).toBe(409);
		expect(await duplicate.json()).toMatchObject({
			code: "TELEGRAM_USER_ID_TAKEN",
			errors: {
				telegramUserId: ["Ese ID de Telegram ya está configurado en otra cuenta."],
			},
		});
	});

	it("rejects unauthenticated, bearer, and privileged callers", async () => {
		state.auth.mockResolvedValueOnce(null);
		const unauthenticated = await putTelegramUserId(putRequest("123"));
		expect(unauthenticated.status).toBe(401);

		const bearer = await putTelegramUserId(
			putRequest("123", { authorization: `Bearer ${"a".repeat(43)}` }),
		);
		expect(bearer.status).toBe(401);

		state.auth.mockResolvedValueOnce({
			user: {
				displayName: "Administradora",
				id: "admin",
				participantId: null,
				role: "admin",
				username: "admin",
			},
		});
		const privileged = await putTelegramUserId(putRequest("123"));
		expect(privileged.status).toBe(403);
	});

	it("maps stale sessions to 404 and database failures to 503", async () => {
		state.auth.mockResolvedValueOnce(userSession("missing", "participant_trinidad"));
		const missing = await putTelegramUserId(putRequest("123"));
		expect(missing.status).toBe(404);

		state.auth.mockResolvedValueOnce(userSession("missing", "participant_trinidad"));
		const missingDelete = await deleteTelegramUserId(
			new Request(TELEGRAM_URL, { method: "DELETE" }),
		);
		expect(missingDelete.status).toBe(404);

		state.database = {
			prepare: () => {
				throw new Error("database unavailable");
			},
		} as unknown as D1Database;
		const unavailable = await putTelegramUserId(putRequest("123"));
		expect(unavailable.status).toBe(503);
	});
});
