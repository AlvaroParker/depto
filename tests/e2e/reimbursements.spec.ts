import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("marks a reimbursement paid and updates the dashboard", async ({ page }) => {
	const expenseName = uniqueName("Reembolso");
	await signIn(page, "camila");
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(expenseName);
	await page.getByLabel("Monto (CLP)").fill("9000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila", "Trinidad"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	const paidButton = page.getByRole("button", { name: "Marcar pagado: Camila" });
	await expect(paidButton).toBeVisible();
	await paidButton.click();
	await page.getByRole("button", { name: "Marcar pagado sin comprobante" }).click();
	await expect(page.getByText("Reembolsado")).toBeVisible();
	await page.goto("/");
	await expect(page.getByRole("heading", { name: /deudas por persona/i })).toBeVisible();
	const recentExpenseCard = page.getByRole("link", { name: new RegExp(expenseName) });
	await expect(recentExpenseCard.getByText("Tu parte pagada", { exact: true })).toBeVisible();
});
