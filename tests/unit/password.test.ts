import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS } from "@/lib/const/auth";
import { hashPassword, verifyPassword } from "@/lib/util/password";

describe("password hashing", () => {
	it("creates a self-describing PBKDF2-SHA-256 hash with the required work factor", async () => {
		const hash = await hashPassword("una-clave-segura");
		const [algorithm, iterations, salt, digest] = hash.split("$");

		expect(algorithm).toBe("pbkdf2-sha256");
		expect(Number(iterations)).toBe(PBKDF2_ITERATIONS);
		expect(salt.length).toBeGreaterThan(10);
		expect(digest.length).toBeGreaterThan(20);
	});

	it("uses a unique random salt for the same password", async () => {
		const [first, second] = await Promise.all([
			hashPassword("una-clave-segura"),
			hashPassword("una-clave-segura"),
		]);

		expect(first).not.toBe(second);
	});

	it("accepts the matching password and rejects a different one", async () => {
		const hash = await hashPassword("clave-correcta");

		await expect(verifyPassword("clave-correcta", hash)).resolves.toBe(true);
		await expect(verifyPassword("clave-incorrecta", hash)).resolves.toBe(false);
	});

	it.each(["", "sha256$600000$salt$digest", "pbkdf2-sha256$1$c2FsdA$ZGlnZXN0"])(
		"rejects malformed or downgraded hash %j",
		async (hash) => {
			await expect(verifyPassword("cualquier-clave", hash)).resolves.toBe(false);
		},
	);
});
