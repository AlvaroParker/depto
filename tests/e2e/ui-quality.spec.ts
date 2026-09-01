import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import {
	expectMinimumTouchTarget,
	expectNoAccessibilityViolations,
	expectNoHorizontalOverflow,
	expectNoHorizontalOverflowWithin,
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

test("reserves only the space occupied by mobile navigation", async ({ page }) => {
	await signIn(page);
	await page.goto("/");

	for (const viewport of [
		{ height: 700, width: 200 },
		{ height: 700, width: 280 },
		{ height: 700, width: 296 },
		{ height: 700, width: 300 },
		{ height: 700, width: 320 },
		{ height: 800, width: 360 },
		{ height: 1024, width: 768 },
	]) {
		await page.setViewportSize(viewport);
		const navigation = page.getByRole("navigation", { name: "Principal" });
		await expect(navigation).toBeVisible();
		const spacing = await navigation.evaluate((element) => {
			const content = element.previousElementSibling;
			if (!(content instanceof HTMLElement)) throw new Error("App content wrapper was not found.");
			return {
				occupiedHeight: window.innerHeight - element.getBoundingClientRect().top,
				paddingBottom: Number.parseFloat(getComputedStyle(content).paddingBottom),
			};
		});

		expect(spacing.paddingBottom).toBeGreaterThanOrEqual(spacing.occupiedHeight - 1);
		expect(spacing.paddingBottom).toBeLessThanOrEqual(spacing.occupiedHeight + 32);
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

	for (const viewport of responsiveViewports.filter(({ width }) => width <= 390)) {
		await page.setViewportSize(viewport);
		for (const path of ["/", "/expenses"]) {
			await page.goto(path);
			await expectNoHorizontalOverflow(
				page,
				`${path} with long names and aggregate money values at ${viewport.label}`,
			);
		}
	}
});

test("wraps a maximum-length account name on the narrow dashboard", async ({ browser, page }) => {
	await signIn(page, "root-e2e");
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	const displayName = "NombreExtraordinariamenteLargo".repeat(3).slice(0, 80);
	const usersResponse = await page.request.get("/api/admin/users");
	expect(usersResponse.ok()).toBe(true);
	const { users } = (await usersResponse.json()) as {
		users: Array<{ displayName: string; email: string | null; id: string; username: string }>;
	};
	const user = users.find(({ username }) => username === "alvaro");
	if (!user?.email) throw new Error("The Alvaro E2E user was not found.");
	const update = await page.request.patch(`/api/admin/users/${user.id}`, {
		data: {
			displayName,
			email: user.email,
			username: user.username,
		},
	});
	expect(update.ok()).toBe(true);
	const context = await browser.newContext({
		baseURL: process.env.E2E_BASE_URL,
		viewport: { height: 700, width: 200 },
	});

	try {
		const userPage = await context.newPage();
		await signIn(userPage, user.username, password);
		await expect(userPage.getByRole("heading", { name: `Hola, ${displayName}.` })).toBeVisible();
		await expectNoHorizontalOverflow(userPage, "dashboard with an 80-character account name");
	} finally {
		await context.close();
		const restore = await page.request.patch(`/api/admin/users/${user.id}`, {
			data: {
				displayName: user.displayName,
				email: user.email,
				username: user.username,
			},
		});
		expect(restore.ok()).toBe(true);
	}
});

test("bounds long dialogs and keeps their controls reachable on narrow phones", async ({
	page,
}) => {
	await signIn(page, "root-e2e");
	for (const { height, width } of [
		{ height: 700, width: 200 },
		{ height: 640, width: 360 },
		{ height: 800, width: 360 },
	]) {
		await page.setViewportSize({ height, width });
		await page.goto("/settings/users");
		await expectNoHorizontalOverflow(page, `/settings/users at ${width}x${height}`);
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
		await expectNoHorizontalOverflowWithin(dialog, `edit-user dialog at ${width}x${height}`);

		const closeButton = dialog.getByRole("button", { name: "Cerrar" });
		await expect(closeButton).toBeVisible();
		await expectMinimumTouchTarget(closeButton, `dialog close at ${width}x${height}`);
		const saveButton = dialog.getByRole("button", { name: "Guardar cambios" });
		await saveButton.scrollIntoViewIfNeeded();
		await expect(saveButton).toBeVisible();
		await expectMinimumTouchTarget(saveButton, `dialog action at ${width}x${height}`);
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
	}

	await page.setViewportSize({ height: 700, width: 200 });
	await page.goto("/settings/users");
	await page.getByRole("button", { name: "Eliminar acceso de Alvaro" }).click();
	const deleteDialog = page.getByRole("dialog", { name: "Eliminar acceso" });
	await expectNoHorizontalOverflowWithin(deleteDialog, "delete-user dialog at 200x700");
	await page.keyboard.press("Escape");

	await page.goto("/settings/categories");
	await expectNoHorizontalOverflow(page, "/settings/categories at 200x700");
	await page
		.getByRole("button", { name: /^Editar / })
		.first()
		.click();
	const categoryDialog = page.getByRole("dialog", { name: "Editar categoría" });
	await expectNoHorizontalOverflowWithin(categoryDialog, "edit-category dialog at 200x700");
	await page.keyboard.press("Escape");

	await page.goto("/household");
	await expectNoHorizontalOverflow(page, "/household at 200x700");
	await page.getByRole("button", { name: "Agregar dato", exact: true }).click();
	const householdDialog = page.getByRole("dialog", { name: "Agregar dato de la casa" });
	await expectNoHorizontalOverflowWithin(householdDialog, "household editor dialog at 200x700");
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
