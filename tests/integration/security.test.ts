import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scopedFinanceRoutes = [
	"src/app/api/dashboard/route.ts",
	"src/app/api/participants/route.ts",
	"src/app/api/expenses/route.ts",
	"src/app/api/expenses/[id]/route.ts",
	"src/app/api/expenses/[id]/receipt/route.ts",
	"src/app/api/expense-shares/[id]/status/route.ts",
	"src/app/api/expense-shares/[id]/amount/route.ts",
	"src/app/api/expense-shares/[id]/proof/route.ts",
	"src/app/api/reimbursements/pay-all/[paidToParticipantId]/route.ts",
];

const sessionOnlyRoutes = [
	"src/app/api/admin/expense-kinds/route.ts",
	"src/app/api/admin/expense-kinds/[id]/route.ts",
	"src/app/api/household-information/route.ts",
	"src/app/api/household-information/[id]/route.ts",
	"src/app/api/oauth/grants/route.ts",
	"src/app/api/oauth/grants/[id]/route.ts",
];

describe("security gates", () => {
	it("uses the shared session-or-bearer actor on scoped finance routes", async () => {
		for (const route of scopedFinanceRoutes) {
			const source = await readFile(path.join(process.cwd(), route), "utf8");
			expect(source, route).toMatch(/await authenticateRequestActor\(request/);
			expect(source, route).toMatch(/actorAuthenticationErrorResponse\(/);
		}
	});

	it("keeps privileged and grant-management routes session-only", async () => {
		for (const route of sessionOnlyRoutes) {
			const source = await readFile(path.join(process.cwd(), route), "utf8");
			if (route.includes("/oauth/grants")) {
				expect(source, route).toMatch(/allowBearer: false/);
			} else {
				expect(source, route).toMatch(/await auth\(\)/);
				expect(source, route).toMatch(/unauthorizedResponse\(\)/);
			}
		}
	});
});
