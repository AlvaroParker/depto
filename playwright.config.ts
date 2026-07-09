import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	fullyParallel: false,
	testDir: "./tests/e2e",
	use: {
		baseURL: "http://127.0.0.1:3000",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm dev",
		reuseExistingServer: !process.env.CI,
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
