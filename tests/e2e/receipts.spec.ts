import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

test("uploads and privately opens a PDF receipt", async ({ page }) => {
	await signIn(page);
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(uniqueName("Con boleta"));
	await page.getByLabel("Monto (CLP)").fill("4500");
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Camila" });
	await page.getByLabel("Comprobante (opcional)").setInputFiles({
		buffer: Buffer.from("unsupported"),
		mimeType: "text/plain",
		name: "notas.txt",
	});
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByText(/usa un archivo JPG/i)).toBeVisible();
	await page.getByLabel("Comprobante (opcional)").setInputFiles({
		name: "boleta.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
	});
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("link", { name: /ver boleta\.pdf/i })).toBeVisible();
	const href = await page.getByRole("link", { name: /ver boleta\.pdf/i }).getAttribute("href");
	expect(href).toMatch(/\/receipt$/);
	const privateStatus = await page.evaluate(async (receiptHref) => {
		return (await fetch(receiptHref)).status;
	}, href!);
	expect(privateStatus).toBe(200);
	const unauthenticated = await page.context().browser()!.newContext();
	expect((await unauthenticated.request.get(new URL(href!, page.url()).toString())).status()).toBe(
		401,
	);
	await unauthenticated.close();
});
