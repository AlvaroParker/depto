import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("redirects unauthenticated household pages to sign in", async ({ page }) => {
	await page.goto("/expenses");
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole("heading", { level: 1, name: "Bienvenidos a casa" })).toBeVisible();
	await expect(page.locator("h1")).toHaveCount(1);
	await expect(
		page.locator("p").filter({ hasText: /^Lo compartido, claro para todos\.$/ }),
	).toHaveCount(1);
});

test("shows one generic failure for invalid credentials", async ({ page }) => {
	await page.goto("/login");
	await page.getByLabel("Usuario").fill("no-existe");
	await page.getByLabel("Contraseña").fill("clave-incorrecta");
	await page.getByRole("button", { name: "Ingresar" }).click();

	await expect(
		page.getByText(
			"El usuario o la contraseña no son válidos. Revisa ambos datos e inténtalo nuevamente.",
			{ exact: true },
		),
	).toBeVisible();
});

test("signs in a managed active household user", async ({ page }) => {
	await signIn(page, "camila");
	await expect(page.getByRole("heading", { name: /hola, camila/i })).toBeVisible();
	await expect(page.getByText("Tu resumen", { exact: true })).toBeVisible();
});

test("signs out from account settings below the desktop breakpoint", async ({ page }) => {
	await page.setViewportSize({ height: 1024, width: 768 });
	await signIn(page, "camila");
	await page.goto("/settings");

	await page.getByRole("button", { name: "Cerrar sesión" }).click();
	await expect(page).toHaveURL(/\/login$/);
});

test("returns no household data from unauthenticated APIs", async ({ request }) => {
	for (const path of [
		"/api/dashboard",
		"/api/expenses",
		"/api/participants",
		"/api/admin/expense-kinds",
		"/api/household-information",
	]) {
		const response = await request.get(path);
		expect(response.status()).toBe(401);
		expect(await response.text()).not.toContain("Alvaro");
	}
});

test("keeps repeated limited failures generic", async ({ context, page }) => {
	await context.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.42" });
	await page.goto("/login");
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await page.getByLabel("Usuario").fill("limited-account");
		await page.getByLabel("Contraseña").fill("incorrect-password");
		await page.getByRole("button", { name: "Ingresar" }).click();
		await expect(
			page.getByText(
				"El usuario o la contraseña no son válidos. Revisa ambos datos e inténtalo nuevamente.",
				{ exact: true },
			),
		).toBeVisible();
	}
});
