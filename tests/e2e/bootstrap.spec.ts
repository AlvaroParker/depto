import { expect, test } from "@playwright/test";

test("creates the one-time root account on a first deployment", async ({ page }) => {
	if (!process.env.E2E_BOOTSTRAP) {
		await page.goto("/setup");
		await expect(page).toHaveURL(/\/login$/);
		return;
	}

	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	await page.goto("/login");
	await expect(page).toHaveURL(/\/setup$/);
	await expect(page.getByRole("heading", { name: "Crea el usuario root" })).toBeVisible();

	await page.getByLabel("Tu nombre").fill("Administradora raíz");
	await page.getByLabel("Usuario root").fill("root-e2e");
	await page.getByLabel("Contraseña", { exact: true }).fill(password);
	await page.getByLabel("Repetir contraseña").fill(password);
	await page.getByRole("button", { name: "Crear usuario root" }).click();

	await page.waitForURL("/");
	await expect(page.getByRole("heading", { name: /todo en orden/i })).toBeVisible();
	const secondBootstrapStatus = await page.evaluate(async (rootPassword) => {
		return (
			await fetch("/api/bootstrap", {
				body: JSON.stringify({
					displayName: "Segundo root",
					password: rootPassword,
					passwordConfirmation: rootPassword,
					username: "second-root",
				}),
				headers: { "content-type": "application/json" },
				method: "POST",
			})
		).status;
	}, password);
	expect(secondBootstrapStatus).toBe(409);
});
