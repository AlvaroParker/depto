import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

test("creates an exact expense and shows it in detail and history", async ({ page }) => {
	await signIn(page);
	const name = uniqueName("Supermercado");
	await page.locator('a[href="/expenses/new"]:visible').first().click();
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("10000");
	await page.getByLabel("¿Quién pagó?").selectOption("participant_alvaro");
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]+$/);
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(page.getByText("$3.334")).toBeVisible();
	await page.goto("/expenses");
	await expect(page.getByText(name)).toBeVisible();
});

test("shows field validation without navigating", async ({ page }) => {
	await signIn(page);
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(" ");
	await page.getByLabel("Monto (CLP)").fill("0");
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page).toHaveURL(/\/expenses\/new/);
});
