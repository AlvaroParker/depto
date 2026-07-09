import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const protectedRoutes = [
	"src/app/api/dashboard/route.ts",
	"src/app/api/participants/route.ts",
	"src/app/api/expenses/route.ts",
	"src/app/api/expenses/[id]/route.ts",
	"src/app/api/expenses/[id]/receipt/route.ts",
	"src/app/api/expense-shares/[id]/status/route.ts",
];

describe("security gates", () => {
	it("checks authentication before every household API contract", async () => {
		for (const route of protectedRoutes) {
			const source = await readFile(path.join(process.cwd(), route), "utf8");
			expect(source, route).toMatch(/await auth\(\)/);
			expect(source, route).toMatch(/unauthorizedResponse\(\)/);
		}
	});

	it("contains no committed secret, seed password, or production resource identifier", async () => {
		const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
			.split("\0")
			.filter(Boolean)
			.filter((file) => !file.endsWith("pnpm-lock.yaml"));
		for (const file of tracked) {
			const source = await readFile(path.join(process.cwd(), file), "utf8").catch(() => "");
			expect(source, file).not.toMatch(/^AUTH_SECRET=\S+/m);
			expect(source, file).not.toMatch(/^SEED_PASSWORD_(?:ALVARO|CAMILA|TRINIDAD)=\S+/m);
		}
		const wrangler = await readFile(path.join(process.cwd(), "wrangler.jsonc"), "utf8");
		expect(wrangler).toContain("00000000-0000-0000-0000-000000000000");
	});
});
