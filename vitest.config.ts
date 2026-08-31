import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
			"cloudflare:workers": path.resolve(
				import.meta.dirname,
				"tests/fixtures/cloudflare-workers.ts",
			),
			"server-only": path.resolve(import.meta.dirname, "tests/fixtures/server-only.ts"),
		},
	},
	test: {
		coverage: {
			exclude: ["cloudflare-env.d.ts", "tests/**"],
			provider: "v8",
			reporter: ["text", "html"],
		},
		include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "src/**/*.test.tsx"],
		setupFiles: ["./tests/setup.ts"],
	},
});
