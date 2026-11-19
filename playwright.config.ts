import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2ePassword = process.env.E2E_PASSWORD ?? `e2e-${randomUUID()}`;
process.env.E2E_PASSWORD = e2ePassword;
const e2ePort = Number.parseInt(process.env.E2E_PORT ?? "3000", 10);
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65_535) {
	throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
process.env.E2E_BASE_URL = e2eBaseUrl;
const browserCache = path.join(homedir(), ".cache/ms-playwright");
const fallbackChromium = existsSync(browserCache)
	? readdirSync(browserCache)
			.filter((entry) => entry.startsWith("chromium-") && !entry.includes("headless"))
			.sort()
			.reverse()
			.map((entry) => path.join(browserCache, entry, "chrome-linux64/chrome"))
			.find(existsSync)
	: undefined;

export default defineConfig({
	expect: { timeout: 10_000 },
	fullyParallel: false,
	globalSetup: "./tests/e2e/global-setup.ts",
	timeout: 60_000,
	workers: 1,
	testDir: "./tests/e2e",
	use: {
		baseURL: e2eBaseUrl,
		launchOptions: fallbackChromium ? { executablePath: fallbackChromium } : undefined,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command: `pnpm db:reset:local && pnpm dev --port ${e2ePort}`,
		env: {
			APP_BASE_URL: e2eBaseUrl,
			AUTH_SECRET: randomBytes(32).toString("base64url"),
			E2E_PASSWORD: e2ePassword,
		},
		reuseExistingServer: false,
		url: `${e2eBaseUrl}/login`,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chrome",
			testIgnore: /ui-quality\.spec\.ts/,
			use: { ...devices["Pixel 7"] },
		},
	],
});
