import { describe, expect, it } from "vitest";
import { getSecureCookieOverride } from "@/lib/auth/cookies";

describe("Auth.js cookie security", () => {
	it.each([
		{ nextjsEnv: "development", nodeEnv: "production" },
		{ nextjsEnv: "test", nodeEnv: "production" },
		{ nodeEnv: "development" },
		{ nodeEnv: "test" },
	])("disables secure cookies in local runtime %j", (environment) => {
		expect(getSecureCookieOverride(environment)).toBe(false);
	});

	it.each([{ nextjsEnv: "production", nodeEnv: "production" }, {}])(
		"leaves cookie security request-driven outside local runtimes %j",
		(environment) => {
			expect(getSecureCookieOverride(environment)).toBeUndefined();
		},
	);
});
