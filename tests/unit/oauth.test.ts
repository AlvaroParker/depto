import { describe, expect, it } from "vitest";
import { createOAuthCredential, sha256Base64Url, verifyPkceS256 } from "@/lib/oauth/crypto";
import {
	DynamicClientRegistrationSchema,
	isValidRedirectUri,
	normalizeApplicationOrigin,
	parseOAuthScopes,
	serializeOAuthScopes,
} from "@/lib/oauth/validation";

describe("OAuth cryptography", () => {
	it("creates high-entropy opaque credentials and stable hashes", async () => {
		const first = createOAuthCredential();
		const second = createOAuthCredential();
		expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(second).not.toBe(first);
		expect(await sha256Base64Url(first)).toHaveLength(43);
		expect(await sha256Base64Url(first)).toBe(await sha256Base64Url(first));
	});

	it("verifies only valid S256 PKCE pairs", async () => {
		const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
		const challenge = await sha256Base64Url(verifier);
		await expect(verifyPkceS256(verifier, challenge)).resolves.toBe(true);
		await expect(verifyPkceS256(`${verifier}x`, challenge)).resolves.toBe(false);
		await expect(verifyPkceS256("short", challenge)).resolves.toBe(false);
	});
});

describe("OAuth validation", () => {
	it("normalizes only a bare HTTPS application origin", () => {
		expect(normalizeApplicationOrigin("https://Expenses.Example:443")).toBe(
			"https://expenses.example",
		);
		expect(normalizeApplicationOrigin("http://expenses.example")).toBeNull();
		expect(normalizeApplicationOrigin("https://expenses.example/path")).toBeNull();
		expect(normalizeApplicationOrigin("https://user@expenses.example")).toBeNull();
	});

	it("accepts HTTPS and native loopback redirects without credentials or fragments", () => {
		expect(isValidRedirectUri("https://client.example/callback?channel=one")).toBe(true);
		expect(isValidRedirectUri("http://127.0.0.1:4312/callback")).toBe(true);
		expect(isValidRedirectUri("http://localhost:4312/callback")).toBe(true);
		expect(isValidRedirectUri("http://client.example/callback")).toBe(false);
		expect(isValidRedirectUri("https://user@client.example/callback")).toBe(false);
		expect(isValidRedirectUri("https://client.example/callback#secret")).toBe(false);
	});

	it("normalizes supported scopes and rejects unknown scopes", () => {
		expect(parseOAuthScopes("expenses:write expenses:read expenses:read")).toEqual([
			"expenses:read",
			"expenses:write",
		]);
		expect(parseOAuthScopes("admin:write")).toBeNull();
		expect(serializeOAuthScopes(["offline_access", "expenses:read"])).toBe(
			"expenses:read offline_access",
		);
	});

	it("validates dynamic registration metadata", () => {
		const parsed = DynamicClientRegistrationSchema.safeParse({
			client_name: "Asistente",
			redirect_uris: ["https://client.example/callback"],
			token_endpoint_auth_method: "none",
		});
		expect(parsed.success).toBe(true);
		expect(
			DynamicClientRegistrationSchema.safeParse({
				client_name: "Asistente",
				redirect_uris: ["https://client.example/callback", "https://client.example/callback"],
			}).success,
		).toBe(false);
	});
});
