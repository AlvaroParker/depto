import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
			"server-only": path.resolve(import.meta.dirname, "tests/fixtures/server-only.ts"),
		},
	},
	test: {
		fileParallelism: false,
		include: ["tests/integration/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
	},
});
