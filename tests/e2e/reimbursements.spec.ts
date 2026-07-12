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

test("pays every pending expense owed to one person from the dashboard", async ({ page }) => {
	await signIn(page, "alvaro");
	const expenseUrls: string[] = [];
	for (const amount of [6000, 12000]) {
		await page.goto("/expenses/new");
		await page.getByLabel("Nombre del gasto").fill(uniqueName("Pago agrupado"));
		await page.getByLabel("Monto (CLP)").fill(String(amount));
		await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
		await page.getByLabel("¿Quién pagó?").selectOption({ label: "Camila" });
		await page.getByRole("button", { name: "Guardar gasto" }).click();
		await page.waitForURL(
			(url) => url.pathname.startsWith("/expenses/") && url.pathname !== "/expenses/new",
		);
		expenseUrls.push(page.url());
	}

	await page.goto("/");
	await page.getByRole("button", { name: /^Pagar todo lo que debes a Camila:/ }).click();
	const dialog = page.getByRole("dialog", { name: "Pagar deuda a Camila" });
	await expect(dialog.getByText(/gastos por un total/)).toBeVisible();
	await dialog.getByRole("button", { name: /^Pagar \$/ }).click();
	await expect(page.getByRole("status")).toContainText("Pago registrado");

	for (const url of expenseUrls) {
		await page.goto(url);
		await expect(page.getByText("Reembolsado")).toBeVisible();
	}
});
