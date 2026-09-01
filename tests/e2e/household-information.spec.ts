import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

test("lets managers publish household information that regular users can read", async ({
	page,
}) => {
	const title = uniqueName("Agua terraza");
	const updatedProvider = uniqueName("Aguas actualizadas");

	await signIn(page, "root-e2e");
	await page.goto("/household");
	await page.getByRole("button", { name: "Agregar dato", exact: true }).click();
	const createDialog = page.getByRole("dialog", { name: "Agregar dato de la casa" });
	await createDialog.getByRole("button", { name: "Agua", exact: true }).click();
	await createDialog.getByLabel("Nombre").fill(title);
	await createDialog.getByLabel("Empresa o proveedor").fill("Aguas de prueba");
	await createDialog.getByLabel("Nº de cliente o referencia").fill("0012345");
	await createDialog.getByLabel("Sitio de pago").fill("https://example.com/pagar");
	await createDialog.getByRole("button", { name: "Agregar campo" }).click();
	await createDialog.getByLabel("Etiqueta 1").fill("Medidor");
	await createDialog.getByLabel("Valor").fill("M-42");
	await createDialog.getByRole("button", { name: "Guardar dato", exact: true }).click();
	await expect(createDialog).not.toBeVisible();
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	await expect(page.getByText("0012345", { exact: true })).toBeVisible();

	await page.context().clearCookies();
	await signIn(page, "camila");
	await page.goto("/household");
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	await expect(page.getByRole("link", { name: /ir al sitio de pago/i })).toHaveAttribute(
		"href",
		"https://example.com/pagar",
	);
	await expect(page.getByRole("button", { name: `Editar ${title}` })).toHaveCount(0);
	const forbidden = await page.evaluate(
		async (payload) => {
			return (
				await fetch("/api/household-information", {
					body: JSON.stringify(payload),
					headers: { "content-type": "application/json" },
					method: "POST",
				})
			).status;
		},
		{
			fields: [],
			iconKey: "water",
			providerName: "Sin permiso",
			title: "Sin permiso",
		},
	);
	expect(forbidden).toBe(403);

	await page.context().clearCookies();
	await signIn(page, "root-e2e");
	await page.goto("/household");
	await page.getByRole("button", { name: `Editar ${title}` }).click();
	const editDialog = page.getByRole("dialog", { name: "Editar dato de la casa" });
	await editDialog.getByLabel("Empresa o proveedor").fill(updatedProvider);
	await editDialog.getByRole("button", { name: "Guardar dato", exact: true }).click();
	await expect(editDialog).not.toBeVisible();
	await expect(page.getByText(updatedProvider, { exact: true })).toBeVisible();

	await page.getByRole("button", { name: `Archivar ${title}` }).click();
	const archiveDialog = page.getByRole("dialog", { name: "Archivar dato" });
	await archiveDialog.getByRole("button", { name: "Archivar dato", exact: true }).click();
	await expect(page.getByRole("heading", { name: title })).not.toBeVisible();
});
