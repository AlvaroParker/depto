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
});
