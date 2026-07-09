import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

test("marks a reimbursement paid and updates the dashboard", async ({ page }) => {
	await signIn(page);
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(uniqueName("Reembolso"));
	await page.getByLabel("Monto (CLP)").fill("9000");
	await page.getByLabel("¿Quién pagó?").selectOption("participant_alvaro");
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	const paidButtons = page.getByRole("button", { name: "Marcar pagado" });
	await expect(paidButtons).toHaveCount(2);
	await paidButtons.first().click();
	await expect(page.getByText("Reembolsado")).toBeVisible();
	await page.goto("/");
	await expect(page.getByRole("heading", { name: /balance por persona/i })).toBeVisible();
});
