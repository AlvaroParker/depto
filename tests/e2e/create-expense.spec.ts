import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("creates an exact expense and shows it in detail and history", async ({ page }) => {
	await signIn(page);
	const name = uniqueName("Supermercado");
	await page.locator('a[href="/expenses/new"]:visible').first().click();
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("10000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	const notificationSwitch = page.getByRole("switch", {
		name: "Enviar notificaciones por correo",
	});
	await expect(notificationSwitch).toBeChecked();
	await notificationSwitch.uncheck();
	const participantGroup = page.getByRole("group", { name: "¿Entre quiénes se divide?" });
	const paidGroup = page.getByRole("group", { name: "¿Quién ya pagó su parte?" });
	await paidGroup.getByRole("checkbox", { name: /Camila/ }).check();
	await participantGroup.getByRole("checkbox", { name: "Camila", exact: true }).uncheck();
	await expect(paidGroup.getByRole("checkbox", { name: /Camila/ })).toHaveCount(0);
	await participantGroup.getByRole("checkbox", { name: "Camila", exact: true }).check();
	await expect(paidGroup.getByRole("checkbox", { name: /Camila/ })).not.toBeChecked();
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Camila" });
	await expect(paidGroup.getByRole("checkbox", { name: /Alvaro/ })).not.toBeChecked();
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await expect(paidGroup.getByRole("checkbox", { name: /Camila/ })).not.toBeChecked();
	await paidGroup.getByRole("checkbox", { name: /Camila/ }).check();
	const createRequest = page.waitForRequest(
		(request) => request.url().endsWith("/api/expenses") && request.method() === "POST",
	);
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	expect((await createRequest).postDataJSON()).toMatchObject({ sendEmailNotifications: false });
	await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]+$/);
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(page.getByText("$5.000")).toHaveCount(2);
	await expect(page.getByText("Reembolsado", { exact: true })).toBeVisible();
	await expect(page.getByText("Sin comprobante de pago", { exact: true })).toBeVisible();
	await page.goto("/expenses?pending=all");
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
