import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("filters and settles the signed-in user's pending expense shares", async ({ page }) => {
	const expenseName = uniqueName("Pago personal");
	await signIn(page, "alvaro");
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(expenseName);
	await page.getByLabel("Monto (CLP)").fill("12000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila", "Trinidad"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Camila" });
	await page.getByRole("button", { name: "Guardar gasto" }).click();

	await page.goto("/expenses");
	await page.getByLabel("Filtrar por estado").selectOption({ label: "Mis pagos pendientes" });
	await expect(page).toHaveURL(/pending=mine/);
	await expect(page.getByText("Estado: Mis pagos pendientes", { exact: true })).toBeVisible();
	const expenseCard = page.getByRole("link", { name: new RegExp(expenseName) });
	await expect(expenseCard.getByText("Debes", { exact: true })).toBeVisible();
	await expect(expenseCard.getByText("$4.000", { exact: true })).toBeVisible();
	await expect(expenseCard.getByText("Total $12.000", { exact: true })).toBeVisible();
	await expenseCard.click();

	const alvaroShare = page.getByText("Alvaro", { exact: true }).locator("..").locator("..");
	await alvaroShare.getByRole("button", { name: "Marcar pagado" }).click();
	await expect(alvaroShare.getByText("Reembolsado", { exact: true })).toBeVisible();

	await page.goto("/expenses?pending=mine");
	await expect(page.getByText(expenseName, { exact: true })).not.toBeVisible();

	await page.goto("/");
	await expect(page.getByText("Tu resumen", { exact: true })).toBeVisible();
	await expect(page.getByText("Gastado hasta hoy", { exact: true })).toBeVisible();
	await expect(page.getByText("Tu gasto total", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Tus gastos recientes" })).toBeVisible();
	const recentExpenseCard = page.getByRole("link", { name: new RegExp(expenseName) });
	await expect(recentExpenseCard.getByText("Tu parte pagada", { exact: true })).toBeVisible();
});

test("does not offer the personal filter to accounts without participants", async ({ page }) => {
	await signIn(page, "root-e2e");
	await page.goto("/expenses");
	await expect(page.getByLabel("Filtrar por estado").getByText("Mis pagos pendientes")).toHaveCount(
		0,
	);
	const status = await page.evaluate(
		async () => (await fetch("/api/expenses?pending=mine")).status,
	);
	expect(status).toBe(403);
	await page.goto("/");
	await expect(page.getByText("Resumen del hogar", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Gastos recientes" })).toBeVisible();
});
