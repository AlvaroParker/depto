import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOGIN_ATTEMPT_LIMIT, LOGIN_LOCK_MS } from "@/lib/const/auth";
import { authenticateCredentials } from "@/lib/auth/authenticate";
import {
	clearUsernameLoginAttempts,
	isLoginBlocked,
	recordFailedLogin,
} from "@/lib/db/login-attempts";
import { hashPassword } from "@/lib/util/password";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-09T12:00:00.000Z");

describe("credentials authentication and login limits", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		const passwordHash = await hashPassword("clave-de-prueba");
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, created_at, updated_at, disabled_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				"user_alvaro",
				"alvaro",
				passwordHash,
				"Alvaro",
				"participant_alvaro",
				NOW.toISOString(),
				NOW.toISOString(),
				null,
			)
			.run();
	});

	afterEach(async () => {
		await bindings.dispose();
	});

	it("authenticates an active user and clears their username failure window", async () => {
		await recordFailedLogin({
			clientAddress: "192.0.2.10",
			database: bindings.database,
			now: NOW,
			username: "alvaro",
		});
		const result = await authenticateCredentials({
			clientAddress: "192.0.2.10",
			database: bindings.database,
			now: NOW,
			password: "clave-de-prueba",
			username: " Alvaro ",
		});

		expect(result.ok).toBe(true);
		expect(result.val).toMatchObject({ id: "user_alvaro", participantId: "participant_alvaro" });
		const usernameAttempts = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE scope = 'username'")
			.first<{ count: number }>();
		expect(usernameAttempts?.count).toBe(0);
	});

	it("returns the same null result for a wrong password, unknown user, and disabled user", async () => {
		const wrong = await authenticateCredentials({
			clientAddress: "192.0.2.11",
			database: bindings.database,
			now: NOW,
			password: "clave-incorrecta",
			username: "alvaro",
		});
		const unknown = await authenticateCredentials({
			clientAddress: "192.0.2.12",
			database: bindings.database,
			now: NOW,
			password: "clave-incorrecta",
			username: "no-existe",
		});
		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = ? WHERE id = ?")
			.bind(NOW.toISOString(), "user_alvaro")
			.run();
		const disabled = await authenticateCredentials({
			clientAddress: "192.0.2.13",
			database: bindings.database,
			now: NOW,
			password: "clave-de-prueba",
			username: "alvaro",
		});

		expect(wrong.ok && wrong.val).toBeNull();
		expect(unknown.ok && unknown.val).toBeNull();
		expect(disabled.ok && disabled.val).toBeNull();
	});

	it("locks the username and client address after the configured failures", async () => {
		for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
			const recorded = await recordFailedLogin({
				clientAddress: "192.0.2.20",
				database: bindings.database,
				now: new Date(NOW.getTime() + attempt * 1000),
				username: "alvaro",
			});
			expect(recorded.ok).toBe(true);
		}

		const sameUser = await isLoginBlocked({
			clientAddress: "192.0.2.99",
			database: bindings.database,
			now: NOW,
			username: "alvaro",
		});
		const sameAddress = await isLoginBlocked({
			clientAddress: "192.0.2.20",
			database: bindings.database,
			now: NOW,
			username: "camila",
		});

		expect(sameUser.ok && sameUser.val).toBe(true);
		expect(sameAddress.ok && sameAddress.val).toBe(true);
	});

	it("allows attempts after the lock expires and can clear only the username scope", async () => {
		for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
			await recordFailedLogin({
				clientAddress: "192.0.2.30",
				database: bindings.database,
				now: NOW,
				username: "alvaro",
			});
		}
		await clearUsernameLoginAttempts("alvaro", bindings.database);
		const afterClear = await isLoginBlocked({
			clientAddress: "192.0.2.99",
			database: bindings.database,
			now: NOW,
			username: "alvaro",
		});
		const afterExpiry = await isLoginBlocked({
			clientAddress: "192.0.2.30",
			database: bindings.database,
			now: new Date(NOW.getTime() + LOGIN_LOCK_MS + 1000),
			username: "another-user",
		});

		expect(afterClear.ok && afterClear.val).toBe(false);
		expect(afterExpiry.ok && afterExpiry.val).toBe(false);
	});
});
