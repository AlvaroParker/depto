import { expect, test } from "@playwright/test";
import { selectExpenseParticipants, signIn, uniqueName } from "./helpers";

test("creates an expense with exact participant-specific amounts", async ({ page }) => {
	await signIn(page);
	await page.goto("/expenses/new");
	const name = uniqueName("División específica");
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("10000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByLabel("Montos específicos").check();
	await page.getByLabel("Monto de Alvaro").fill("7000");
	await page.getByLabel("Monto de Camila").fill("3000");
	await expect(page.getByText("Total completo", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(page.getByText("Montos específicos", { exact: true })).toBeVisible();
	await expect(page.getByText("$7.000")).toBeVisible();
	await expect(page.getByText("$3.000")).toBeVisible();
});

test("creates and reopens a custom expense whose payer is outside the share recipients", async ({
	page,
}) => {
	await signIn(page);
	await page.goto("/expenses/new");
	const name = uniqueName("Pagador externo");
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("10000");
	await selectExpenseParticipants(page, ["Camila", "Trinidad"]);
	const payerSelect = page.getByLabel("¿Quién pagó?");
	const alvaroId = await payerSelect.locator("option", { hasText: "Alvaro" }).getAttribute("value");
	const camilaId = await payerSelect.locator("option", { hasText: "Camila" }).getAttribute("value");
	const trinidadId = await payerSelect
		.locator("option", { hasText: "Trinidad" })
		.getAttribute("value");
	if (!alvaroId || !camilaId || !trinidadId) throw new Error("Missing participant options.");
	await payerSelect.selectOption(alvaroId);
	await page.getByLabel("Montos específicos").check();
	await page.getByLabel("Monto de Camila").fill("7000");
	await page.getByLabel("Monto de Trinidad").fill("3000");

	const createRequest = page.waitForRequest(
		(request) => request.url().endsWith("/api/expenses") && request.method() === "POST",
	);
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	expect((await createRequest).postDataJSON()).toMatchObject({
		paidByParticipantId: alvaroId,
		participantIds: [camilaId, trinidadId],
		shareAllocations: [
			{ participantId: camilaId, shareAmountMinor: 7_000 },
			{ participantId: trinidadId, shareAmountMinor: 3_000 },
		],
		splitMode: "custom",
	});
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await page.getByRole("link", { name: "Editar" }).click();
	await expect(page.getByLabel("¿Quién pagó?")).toHaveValue(alvaroId);
	const recipients = page.getByRole("group", { name: "¿Entre quiénes se divide?" });
	await expect(recipients.getByRole("checkbox", { name: "Alvaro" })).not.toBeChecked();
	await expect(recipients.getByRole("checkbox", { name: "Camila" })).toBeChecked();
	await expect(recipients.getByRole("checkbox", { name: "Trinidad" })).toBeChecked();
});

test("lets an open-share owner adjust their amount while the payer absorbs the remainder", async ({
	browser,
	page,
}) => {
	await signIn(page);
	await page.goto("/expenses/new");
	const name = uniqueName("Cuenta abierta");
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("10000");
	await selectExpenseParticipants(page, ["Alvaro", "Camila"]);
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByLabel("Cuenta abierta").check();
	await page.getByLabel("Monto de Camila").fill("3000");
	await expect(page.getByLabel("Monto de Alvaro")).toHaveValue("7000");
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible();
	const expenseUrl = page.url();

	const participantContext = await browser.newContext();
	const participantPage = await participantContext.newPage();
	try {
		await signIn(participantPage, "camila");
		await participantPage.goto(expenseUrl);
		await participantPage.getByRole("button", { name: "Cambiar monto: Camila" }).click();
		const dialog = participantPage.getByRole("dialog", { name: "Ajustar monto abierto" });
		await dialog.getByLabel("Monto que pagará").fill("4000");
		await dialog.getByRole("button", { name: "Guardar monto" }).click();
		await expect(dialog).not.toBeVisible();
		await expect(participantPage.getByText("$6.000")).toBeVisible();
		await expect(participantPage.getByText("$4.000")).toBeVisible();
		await participantPage.getByRole("button", { name: "Marcar pagado: Camila" }).click();
		await participantPage.getByRole("button", { name: "Marcar pagado sin comprobante" }).click();
		await expect(participantPage.getByText("Reembolsado", { exact: true })).toBeVisible();
		await expect(
			participantPage.getByRole("button", { name: "Cambiar monto: Camila" }),
		).toHaveCount(0);
	} finally {
		await participantContext.close();
	}
});
