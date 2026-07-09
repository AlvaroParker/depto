import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
		},
	},
	test: {
		coverage: {
			exclude: ["cloudflare-env.d.ts", "tests/**"],
			provider: "v8",
			reporter: ["text", "html"],
		},
		exclude: ["tests/e2e/**", "tests/integration/**"],
		setupFiles: ["./tests/setup.ts"],
	},
});
