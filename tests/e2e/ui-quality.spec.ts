import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import {
	expectMinimumTouchTarget,
	expectNoAccessibilityViolations,
	expectNoHorizontalOverflow,
	responsiveViewports,
} from "./ui-quality";

const coreRoutes = ["/", "/expenses", "/expenses/new", "/household", "/settings"];

test("keeps core routes within every supported viewport", async ({ page }) => {
	await signIn(page);
	for (const viewport of responsiveViewports) {
		await page.setViewportSize(viewport);
		for (const path of coreRoutes) {
			await page.goto(path);
			await expectNoHorizontalOverflow(page, `${path} at ${viewport.label}`);
		}
	}
});

test("reflows navigation at a 200% zoom-equivalent width without hiding labels", async ({
	page,
}) => {
	await signIn(page);
	await page.setViewportSize({ height: 700, width: 200 });
	await page.goto("/");
	await expectNoHorizontalOverflow(page, "dashboard at 200% zoom-equivalent width");

	const navigation = page.getByRole("navigation", { name: "Principal" });
	const links = navigation.getByRole("link");
	await expect(links).toHaveCount(5);
	for (const label of ["Resumen", "Gastos", "Agregar", "Casa", "Ajustes"]) {
		const link = navigation.getByRole("link", { name: label, exact: true });
		await expect(link).toBeVisible();
		await expectMinimumTouchTarget(link, `${label} navigation link`);
	}
	const rowPositions = await links.evaluateAll((elements) =>
		Array.from(new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top)))),
	);
	expect(rowPositions).toHaveLength(2);
});

test("keeps standalone navigation and filter actions at least 44px tall", async ({ page }) => {
	await page.setViewportSize({ height: 800, width: 360 });
	await signIn(page);

	await page.goto("/expenses/new");
	await expectMinimumTouchTarget(
		page.getByRole("link", { name: "Volver a gastos" }),
		"new-expense back link",
	);

	await page.goto("/");
	await expectMinimumTouchTarget(
		page.getByRole("link", { name: "Ver todos" }),
		"dashboard expenses link",
	);

	await page.goto("/expenses");
	await expectMinimumTouchTarget(
		page.getByRole("button", { name: /Quitar Estado:/ }),
		"active filter removal",
	);
	await expectMinimumTouchTarget(
		page.getByRole("button", { name: "Limpiar todos" }),
		"clear filters action",
	);
});

test("wraps long expense content without horizontal scrolling", async ({ page }) => {
	await page.setViewportSize({ height: 800, width: 360 });
	await signIn(page);
	await page.goto("/expenses/new");
	const name = `Compra-${"ExtraordinariamenteLarga".repeat(5)}`.slice(0, 120);
	await page.getByLabel("Nombre del gasto").fill(name);
	await page.getByLabel("Monto (CLP)").fill("888888888888888");
	await page.getByLabel("¿Quién pagó?").selectOption({ label: "Alvaro" });
	await page.getByLabel("Descripción (opcional)").fill("DetalleSinEspacios".repeat(30));
	await page.getByRole("button", { name: "Guardar gasto" }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible();
	const expenseUrl = page.url();

	for (const viewport of responsiveViewports) {
		await page.setViewportSize(viewport);
		await page.goto(expenseUrl);
		await expectNoHorizontalOverflow(page, `long expense detail at ${viewport.label}`);
		await expect(page.getByRole("heading", { name })).toBeVisible();
	}
});

test("bounds long dialogs and keeps their controls reachable on short phones", async ({ page }) => {
	await signIn(page, "root-e2e");
	for (const height of [640, 800]) {
		await page.setViewportSize({ height, width: 360 });
		await page.goto("/settings/users");
		await page.getByRole("button", { name: "Editar a Alvaro" }).click();
		const dialog = page.getByRole("dialog", { name: "Editar acceso" });
		const sheet = dialog.locator(":scope > div > div");
		await sheet.evaluate(async (element) => {
			await Promise.all(element.getAnimations().map((animation) => animation.finished));
		});
		const sheetBox = await sheet.boundingBox();
		expect(sheetBox).not.toBeNull();
		expect(sheetBox!.y).toBeGreaterThanOrEqual(0);
		expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(height + 1);

		const closeButton = dialog.getByRole("button", { name: "Cerrar" });
		await expect(closeButton).toBeVisible();
		await expectMinimumTouchTarget(closeButton, `dialog close at 360x${height}`);
		const saveButton = dialog.getByRole("button", { name: "Guardar cambios" });
		await saveButton.scrollIntoViewIfNeeded();
		await expect(saveButton).toBeVisible();
		await expectMinimumTouchTarget(saveButton, `dialog action at 360x${height}`);
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
	}
});

test("has no automated accessibility violations on representative responsive routes", async ({
	page,
}) => {
	await page.setViewportSize({ height: 900, width: 1440 });
	await page.goto("/login");
	await expectNoAccessibilityViolations(page, "/login at 1440x900");

	await signIn(page);
	for (const scenario of [
		{ height: 844, path: "/expenses/new", width: 390 },
		{ height: 900, path: "/", width: 1440 },
	] as const) {
		await page.setViewportSize(scenario);
		await page.goto(scenario.path);
		await expectNoAccessibilityViolations(
			page,
			`${scenario.path} at ${scenario.width}x${scenario.height}`,
		);
	}
});
