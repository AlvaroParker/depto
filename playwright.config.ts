import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2ePassword = process.env.E2E_PASSWORD ?? `e2e-${randomUUID()}`;
process.env.E2E_PASSWORD = e2ePassword;
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
		baseURL: "http://127.0.0.1:3000",
		launchOptions: fallbackChromium ? { executablePath: fallbackChromium } : undefined,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm db:reset:local && pnpm dev",
		env: {
			AUTH_SECRET: randomBytes(32).toString("base64url"),
			E2E_PASSWORD: e2ePassword,
		},
		reuseExistingServer: false,
		url: "http://127.0.0.1:3000/login",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chrome",
			use: { ...devices["Pixel 7"] },
		},
	],
});
