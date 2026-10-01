import { expect, test, type Page } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

async function copyImage(page: Page) {
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.evaluate(async () => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 16;
		canvas.getContext("2d")!.fillRect(0, 0, 16, 16);
		const image = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error("Could not create clipboard image"))),
				"image/png",
			);
		});
		await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
	});
}

async function prepareExpense(page: Page) {
	await page.goto("/expenses/new");
	await page.getByLabel("Nombre del gasto").fill(uniqueName("Imagen pegada"));
	await page.getByLabel("Monto (CLP)").fill("6000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Camila" });
}

async function expectStoredImage(page: Page, href: string | null) {
	expect(href).toBeTruthy();
	const response = await page.request.get(href!);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await response.body()).length).toBeGreaterThan(8);
}

test("pastes a receipt from the clipboard button before saving an expense", async ({ page }) => {
	await signIn(page);
	await prepareExpense(page);
	await copyImage(page);
	await page.getByRole("button", { name: "Pegar imagen" }).click();
	await expect(page.getByRole("status")).toHaveText("Archivo seleccionado: imagen-pegada.png");
	await page.getByRole("button", { name: "Quitar archivo seleccionado" }).click();
	await expect(page.getByText("Archivo seleccionado:")).not.toBeVisible();
	await page.getByRole("button", { name: "Pegar imagen" }).click();
	await expect(page.getByRole("status")).toContainText("imagen-pegada.png");
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	const receipt = page.getByRole("link", { name: "Ver imagen-pegada.png" });
	await expect(receipt).toBeVisible();
	await expectStoredImage(page, await receipt.getAttribute("href"));
});

test("uploads a receipt on an existing expense using keyboard paste", async ({ page }) => {
	await signIn(page);
	await prepareExpense(page);
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("button", { name: "Subir comprobante" })).toBeVisible();
	await copyImage(page);
	await page.getByRole("button", { name: "Pegar imagen" }).focus();
	await page.keyboard.press("ControlOrMeta+V");
	const receipt = page.getByRole("link", { name: /Ver .*\.png/ });
	await expect(receipt).toBeVisible();
	await expectStoredImage(page, await receipt.getAttribute("href"));
});

test("pastes and replaces an individual payment proof", async ({ page }) => {
	await signIn(page);
	await prepareExpense(page);
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await page.getByRole("button", { name: "Marcar pagado: Alvaro" }).click();
	const dialog = page.getByRole("dialog", { name: "Registrar pago" });
	await copyImage(page);
	await dialog.getByRole("button", { name: "Pegar imagen" }).focus();
	await page.keyboard.press("ControlOrMeta+V");
	await expect(dialog.getByRole("status")).toContainText("Archivo seleccionado:");
	await dialog.getByRole("button", { name: "Marcar pagado y subir comprobante" }).click();
	const proof = page.getByRole("link", { name: "Ver comprobante de pago de Alvaro" });
	await expect(proof).toBeVisible();
	await expectStoredImage(page, await proof.getAttribute("href"));
	await page.getByRole("button", { name: "Reemplazar comprobante: Alvaro" }).click();
	const replacement = page.getByRole("dialog", { name: "Comprobante de pago" });
	await replacement.getByRole("button", { name: "Pegar imagen" }).click();
	await expect(replacement.getByRole("status")).toContainText("imagen-pegada.png");
	await replacement.getByRole("button", { exact: true, name: "Reemplazar comprobante" }).click();
	await expect(replacement).not.toBeVisible();
	await expect(page.getByText("imagen-pegada.png", { exact: true })).toBeVisible();
});

test("attaches a pasted image when paying all debt to a person", async ({ page }) => {
	await signIn(page);
	await prepareExpense(page);
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("button", { name: "Marcar pagado: Alvaro" })).toBeVisible();
	const expenseUrl = page.url();
	await page.goto("/");
	await page.getByRole("button", { name: /Pagar todo lo que debes a Camila:/ }).click();
	const dialog = page.getByRole("dialog", { name: "Pagar deuda a Camila" });
	await copyImage(page);
	await dialog.getByRole("button", { name: "Pegar imagen" }).click();
	await expect(dialog.getByRole("status")).toContainText("imagen-pegada.png");
	await dialog.getByRole("button", { name: /Pagar .* y subir comprobante/ }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole("status")).toContainText("Pago registrado:");
	await page.goto(expenseUrl);
	const proof = page.getByRole("link", { name: "Ver comprobante de pago de Alvaro" });
	await expect(proof).toBeVisible();
	await expectStoredImage(page, await proof.getAttribute("href"));
});
