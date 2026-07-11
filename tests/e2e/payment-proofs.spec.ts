import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("uploads, views, replaces, and removes proof for an owned reimbursement", async ({ page }) => {
	const expenseName = uniqueName("Pago con respaldo");
	await signIn(page, "camila");
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(expenseName);
	await page.getByLabel("Monto (CLP)").fill("9000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila", "Trinidad"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByRole("button", { name: "Guardar gasto" }).click();

	await page.getByRole("button", { name: "Marcar pagado: Camila" }).click();
	await page.getByLabel("Comprobante de pago (opcional)").setInputFiles({
		buffer: Buffer.from("private-payment-image"),
		mimeType: "image/png",
		name: "transferencia.png",
	});
	await page.getByRole("button", { name: "Marcar pagado y subir comprobante" }).click();

	const proofLink = page.getByRole("link", { name: "Ver comprobante de pago de Camila" });
	await expect(proofLink).toBeVisible();
	const href = await proofLink.getAttribute("href");
	expect(href).toMatch(/\/expense-shares\/[^/]+\/proof$/);
	expect(await page.evaluate(async (url) => (await fetch(url)).status, href!)).toBe(200);

	const anonymous = await page.context().browser()!.newContext();
	expect((await anonymous.request.get(new URL(href!, page.url()).toString())).status()).toBe(401);
	await anonymous.close();

	await page.getByRole("button", { name: "Reemplazar comprobante: Camila" }).click();
	await page.getByLabel("Comprobante de pago (opcional)").setInputFiles({
		buffer: Buffer.from("replacement-image"),
		mimeType: "image/jpeg",
		name: "transferencia-final.jpg",
	});
	await page.getByRole("button", { exact: true, name: "Reemplazar comprobante" }).click();
	await expect(page.getByText("transferencia-final.jpg")).toBeVisible();

	await page.getByRole("button", { name: "Marcar pendiente: Camila" }).click();
	await page.getByRole("button", { name: "Quitar comprobante y marcar pendiente" }).click();
	await expect(proofLink).not.toBeVisible();
});
