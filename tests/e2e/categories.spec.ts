import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("blocks regular users from category administration", async ({ page }) => {
	await signIn(page, "camila");
	const status = await page.evaluate(async () => (await fetch("/api/admin/expense-kinds")).status);
	expect(status).toBe(403);
	await page.goto("/settings/categories");
	await expect(page).toHaveURL(/\/settings$/);
});

test("lets an admin create and edit an icon category, then use and filter it", async ({ page }) => {
	const initialName = uniqueName("Vacaciones");
	const editedName = uniqueName("Celebraciones");
	const expenseName = uniqueName("Cena familiar");

	await signIn(page, "root-e2e");
	await page.goto("/settings/categories");
	await page.getByLabel("Nombre", { exact: true }).fill(initialName);
	await page.getByLabel("Viajes", { exact: true }).check();
	await page.getByRole("button", { name: "Crear categoría" }).click();
	await expect(page.getByRole("heading", { name: initialName })).toBeVisible();

	await page.getByRole("button", { name: `Editar ${initialName}` }).click();
	const dialog = page.getByRole("dialog", { name: "Editar categoría" });
	await dialog.getByLabel("Nombre", { exact: true }).fill(editedName);
	await dialog.getByLabel("Regalos", { exact: true }).check();
	await dialog.getByRole("button", { name: "Guardar cambios" }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole("heading", { name: editedName })).toBeVisible();

	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(expenseName);
	await page.getByLabel("Categoría").selectOption({ label: editedName });
	await page.getByLabel("Monto (CLP)").fill("12000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]+$/);
	await expect(page.getByText(editedName, { exact: false })).toBeVisible();

	await page.goto("/expenses");
	await page.getByLabel("Filtrar por categoría").selectOption({ label: editedName });
	await expect(page.getByText(`Categoría: ${editedName}`, { exact: true })).toBeVisible();
	await expect(page.getByText(expenseName, { exact: true })).toBeVisible();
});
