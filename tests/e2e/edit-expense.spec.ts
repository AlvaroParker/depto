import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

test("edits and deletes an expense with explicit confirmation", async ({ page }) => {
	await signIn(page);
	await page.goto("/expenses/new");
	const name = uniqueName("Para corregir");
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("3000");
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Trinidad" });
	await page.getByLabel("Comprobante (opcional)").setInputFiles({
		buffer: Buffer.from("%PDF-1.4\n% original\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
		mimeType: "application/pdf",
		name: "original.pdf",
	});
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await page.getByRole("link", { name: "Editar" }).click();
	await page.getByLabel("Nombre del gasto").fill(`${name} editado`);
	await page.getByLabel("Comprobante (opcional)").setInputFiles({
		buffer: Buffer.from("%PDF-1.4\n% replacement\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
		mimeType: "application/pdf",
		name: "reemplazo.pdf",
	});
	await page.getByRole("button", { name: "Guardar cambios" }).click();
	await expect(page.getByRole("heading", { name: `${name} editado` })).toBeVisible();
	await expect(page.getByRole("link", { name: /ver reemplazo\.pdf/i })).toBeVisible();
	await page.getByRole("link", { name: "Editar" }).click();
	await page.getByRole("button", { name: "Eliminar gasto" }).click();
	await page
		.getByRole("dialog", { name: "¿Eliminar este gasto?" })
		.getByRole("button", { name: "Eliminar gasto" })
		.click();
	await expect(page).toHaveURL(/\/expenses$/);
	await expect(page.getByText(`${name} editado`)).toHaveCount(0);
});
