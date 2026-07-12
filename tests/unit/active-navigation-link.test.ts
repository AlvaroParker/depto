import { describe, expect, it } from "vitest";
import { getActiveNavigationHref } from "@/components/layout/active-navigation-link";

const navigationHrefs = ["/", "/expenses", "/household", "/settings", "/settings/users"];

describe("getActiveNavigationHref", () => {
	it("highlights Resumen only on the home page", () => {
		expect(getActiveNavigationHref("/", navigationHrefs)).toBe("/");
		expect(getActiveNavigationHref("/expenses", navigationHrefs)).not.toBe("/");
	});

	it("keeps a section highlighted on nested routes", () => {
		expect(getActiveNavigationHref("/expenses/expense-1/edit", navigationHrefs)).toBe("/expenses");
		expect(getActiveNavigationHref("/household", navigationHrefs)).toBe("/household");
	});

	it("prefers the most specific navigation entry", () => {
		expect(getActiveNavigationHref("/settings/users", navigationHrefs)).toBe("/settings/users");
	});
});
