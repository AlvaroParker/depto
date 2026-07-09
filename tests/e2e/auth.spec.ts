import { expect, test } from "@playwright/test";

test("redirects unauthenticated household pages to sign in", async ({ page }) => {
	await page.goto("/expenses");
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole("heading", { name: /bienvenid/i })).toBeVisible();
});

test("shows one generic failure for invalid credentials", async ({ page }) => {
	await page.goto("/login");
	await page.getByLabel("Usuario").fill("no-existe");
	await page.getByLabel("Contraseña").fill("clave-incorrecta");
	await page.getByRole("button", { name: "Ingresar" }).click();

	await expect(page.getByRole("alert")).toHaveText(/usuario o contraseña no son válidos/i);
});
