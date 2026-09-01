import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const originalTelegramUserId = "123456789012";
const replacementTelegramUserId = "987654321012";

async function clearTelegramUserId(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await fetch("/api/profile/telegram", { method: "DELETE" });
	});
}

test("lets regular users manage a unique Telegram ID while hiding it from root", async ({
	browser,
}) => {
	const alvaroContext = await browser.newContext();
	const camilaContext = await browser.newContext();
	const rootContext = await browser.newContext();
	const alvaroPage = await alvaroContext.newPage();
	const camilaPage = await camilaContext.newPage();
	const rootPage = await rootContext.newPage();

	try {
		await signIn(alvaroPage, "alvaro");
		await signIn(camilaPage, "camila");
		await signIn(rootPage, "root-e2e");
		await clearTelegramUserId(alvaroPage);
		await clearTelegramUserId(camilaPage);

		await alvaroPage.goto("/settings");
		await expect(alvaroPage.getByRole("heading", { name: "Tu cuenta" })).toBeVisible();
		const alvaroInput = alvaroPage.getByLabel("ID de usuario de Telegram");
		await alvaroInput.fill("@alvaro");
		await alvaroPage.getByRole("button", { name: "Guardar ID" }).click();
		await expect(alvaroPage.getByText("Ingresa un ID numérico de Telegram válido.")).toBeVisible();

		await alvaroInput.fill(originalTelegramUserId);
		await alvaroPage.getByRole("button", { name: "Guardar ID" }).click();
		await expect(alvaroPage.getByRole("status")).toHaveText("Tu ID de Telegram fue guardado.");
		await expect(alvaroPage.getByText("Configurado", { exact: true })).toBeVisible();

		await alvaroPage.reload();
		await expect(alvaroPage.getByLabel("ID de usuario de Telegram")).toHaveValue(
			originalTelegramUserId,
		);
		await alvaroPage.getByLabel("ID de usuario de Telegram").fill(replacementTelegramUserId);
		await alvaroPage.getByRole("button", { name: "Actualizar ID" }).click();
		await expect(alvaroPage.getByRole("status")).toHaveText("Tu ID de Telegram fue actualizado.");

		await camilaPage.goto("/settings");
		await camilaPage.getByLabel("ID de usuario de Telegram").fill(replacementTelegramUserId);
		await camilaPage.getByRole("button", { name: "Guardar ID" }).click();
		await expect(
			camilaPage.getByText("Ese ID de Telegram ya está configurado en otra cuenta."),
		).toBeVisible();

		await rootPage.goto("/settings");
		await expect(rootPage.getByRole("heading", { name: "La casa" })).toBeVisible();
		await expect(rootPage.getByRole("heading", { name: "Telegram" })).toHaveCount(0);
		await expect(rootPage.getByLabel("ID de usuario de Telegram")).toHaveCount(0);

		await alvaroPage.getByRole("button", { name: "Eliminar ID" }).click();
		const removalDialog = alvaroPage.getByRole("dialog", { name: "Eliminar ID de Telegram" });
		await expect(removalDialog).toContainText(replacementTelegramUserId);
		await removalDialog.getByRole("button", { name: "Eliminar ID" }).click();
		await expect(alvaroPage.getByRole("status")).toHaveText("Tu ID de Telegram fue eliminado.");
		await alvaroPage.reload();
		await expect(alvaroPage.getByLabel("ID de usuario de Telegram")).toHaveValue("");
		await expect(alvaroPage.getByText("Configurado", { exact: true })).toHaveCount(0);
	} finally {
		await Promise.allSettled([clearTelegramUserId(alvaroPage), clearTelegramUserId(camilaPage)]);
		await Promise.all([alvaroContext.close(), camilaContext.close(), rootContext.close()]);
	}
});
