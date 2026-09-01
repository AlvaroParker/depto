import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { expectNoHorizontalOverflow } from "./ui-quality";

test("fits core routes at 360px and exposes keyboard-focusable controls", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await signIn(page);
	for (const path of ["/", "/expenses", "/expenses/new", "/household", "/settings"]) {
		await page.goto(path);
		await expectNoHorizontalOverflow(page, `${path} in the legacy 360px mobile check`);
	}
	await page.goto("/expenses/new");
	await page.keyboard.press("Tab");
	await expect(page.locator(":focus")).toBeVisible();
	await expect(page.getByLabel("Nombre del gasto")).toBeVisible();
});
