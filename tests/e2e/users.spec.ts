import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("blocks regular users from account administration", async ({ page }) => {
	await signIn(page, "camila");
	const status = await page.evaluate(async () => (await fetch("/api/admin/users")).status);
	expect(status).toBe(403);
	const patchStatus = await page.evaluate(async () => {
		return (
			await fetch("/api/admin/users/user_trinidad", {
				body: JSON.stringify({ displayName: "Sin permiso", username: "sin-permiso" }),
				headers: { "content-type": "application/json" },
				method: "PATCH",
			})
		).status;
	});
	expect(patchStatus).toBe(403);
	const bankAccountStatus = await page.evaluate(async () => {
		return (
			await fetch("/api/admin/participants/participant_camila/bank-account", {
				body: JSON.stringify({
					accountNumber: "123",
					accountType: "Cuenta Vista",
					bankName: "Banco",
					rut: "18.972.631-7",
				}),
				headers: { "content-type": "application/json" },
				method: "PUT",
			})
		).status;
	});
	expect(bankAccountStatus).toBe(403);
	await page.goto("/settings/users");
	await expect(page).toHaveURL(/\/settings$/);
});

test("lets managers add, edit, and remove participant bank details", async ({ page }) => {
	const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
	const username = `bank-${suffix}`;
	const displayName = `Cuenta bancaria ${suffix}`;
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");

	await signIn(page, "root-e2e");
	await page.goto("/settings/users");
	await page.getByLabel("Nombre").fill(displayName);
	await page.getByLabel("Usuario", { exact: true }).fill(username);
	await page.getByLabel("Rol", { exact: true }).selectOption("user");
	await page.getByLabel("Correo", { exact: true }).fill(`${username}@example.com`);
	await page.getByLabel("Contraseña inicial").fill(password);
	await page.getByRole("button", { name: "Crear acceso" }).click();
	const userCard = page
		.locator("article")
		.filter({ has: page.getByRole("heading", { exact: true, name: displayName }) });
	await userCard
		.getByRole("button", { name: `Administrar datos bancarios de ${displayName}` })
		.click();

	let dialog = page.getByRole("dialog", { name: "Datos bancarios" });
	await dialog.getByLabel("RUT").fill("189726317");
	await dialog.getByLabel("Tipo de cuenta").selectOption("Cuenta Vista");
	await dialog.getByLabel("Número de cuenta").fill("001234");
	await dialog.getByLabel("Banco").fill("Banco inicial");
	await dialog.getByRole("button", { name: "Guardar datos" }).click();
	await expect(page.getByRole("status")).toContainText(
		`Datos bancarios de ${displayName} actualizados`,
	);
	await expect(userCard.getByText("Banco inicial · Cuenta Vista", { exact: true })).toBeVisible();

	await userCard
		.getByRole("button", { name: `Administrar datos bancarios de ${displayName}` })
		.click();
	dialog = page.getByRole("dialog", { name: "Datos bancarios" });
	await expect(dialog.getByLabel("RUT")).toHaveValue("18.972.631-7");
	await dialog.getByLabel("Tipo de cuenta").selectOption("Cuenta Corriente");
	await dialog.getByLabel("Banco").fill("Banco actualizado");
	await dialog.getByRole("button", { name: "Guardar datos" }).click();
	await expect(
		userCard.getByText("Banco actualizado · Cuenta Corriente", { exact: true }),
	).toBeVisible();

	await userCard
		.getByRole("button", { name: `Administrar datos bancarios de ${displayName}` })
		.click();
	await page.getByRole("button", { name: "Eliminar datos", exact: true }).click();
	const removal = page.getByRole("dialog", { name: "Eliminar datos bancarios" });
	await removal.getByRole("button", { name: "Eliminar datos" }).click();
	await expect(userCard.getByText("Datos bancarios pendientes", { exact: true })).toBeVisible();
});

test("lets root and admin update regular-user names, usernames, and passwords", async ({
	page,
}) => {
	const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
	const adminUsername = `editor-${suffix}`;
	const userUsername = `editable-${suffix}`;
	const rootEditedUsername = `root-edit-${suffix}`;
	const adminEditedUsername = `admin-edit-${suffix}`;
	const rootEditedDisplayName = `Usuario renovado por root ${suffix}`;
	const adminEditedDisplayName = `Usuario renovado por admin ${suffix}`;
	const originalEmail = `editable-${suffix}@example.com`;
	const rootEditedEmail = `root-edit-${suffix}@example.com`;
	const adminEditedEmail = `admin-edit-${suffix}@example.com`;
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	const rootEditedPassword = `${password}-root`;
	const adminEditedPassword = `${password}-admin`;

	await signIn(page, "root-e2e");
	await page.goto("/settings/users");
	for (const [name, username, role] of [
		["Administradora editora", adminUsername, "admin"],
		["Usuario editable", userUsername, "user"],
	] as const) {
		await page.getByLabel("Nombre").fill(name);
		await page.getByLabel("Usuario", { exact: true }).fill(username);
		await page.getByLabel("Rol", { exact: true }).selectOption(role);
		if (role === "user") await page.getByLabel("Correo", { exact: true }).fill(originalEmail);
		await page.getByLabel("Contraseña inicial").fill(password);
		await page.getByRole("button", { name: "Crear acceso" }).click();
		await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
	}

	await expect(page.getByRole("button", { name: "Editar a Administradora editora" })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "Editar a Usuario editable" }).click();
	const rootEditDialog = page.getByRole("dialog", { name: "Editar acceso" });
	await rootEditDialog.getByLabel("Nombre visible").fill(rootEditedDisplayName);
	await rootEditDialog.getByLabel("Usuario", { exact: true }).fill(rootEditedUsername);
	await rootEditDialog.getByLabel("Correo", { exact: true }).fill(rootEditedEmail);
	await rootEditDialog.getByLabel("Nueva contraseña").fill(rootEditedPassword);
	await rootEditDialog.getByRole("button", { name: "Guardar cambios" }).click();
	await expect(rootEditDialog).not.toBeVisible();
	await expect(page.getByText(rootEditedDisplayName, { exact: true })).toBeVisible();
	await expect(page.getByText(`@${rootEditedUsername}`, { exact: true })).toBeVisible();

	const protectedStatus = await page.evaluate(async () => {
		const payload = (await (await fetch("/api/admin/users")).json()) as {
			users: Array<{ id: string; role: string }>;
		};
		const root = payload.users.find((user) => user.role === "root");
		if (!root) throw new Error("Root fixture was not found.");
		return (
			await fetch(`/api/admin/users/${root.id}`, {
				body: JSON.stringify({
					displayName: "Root editado",
					email: "root@example.com",
					username: "root-editado",
				}),
				headers: { "content-type": "application/json" },
				method: "PATCH",
			})
		).status;
	});
	expect(protectedStatus).toBe(409);

	await page.context().clearCookies();
	await signIn(page, rootEditedUsername, rootEditedPassword);
	await page.context().clearCookies();
	await signIn(page, adminUsername);
	await page.goto("/settings/users");
	await page.getByRole("button", { name: `Editar a ${rootEditedDisplayName}` }).click();
	const adminEditDialog = page.getByRole("dialog", { name: "Editar acceso" });
	await adminEditDialog.getByLabel("Nombre visible").fill(adminEditedDisplayName);
	await adminEditDialog.getByLabel("Usuario", { exact: true }).fill(adminEditedUsername);
	await adminEditDialog.getByLabel("Correo", { exact: true }).fill(adminEditedEmail);
	await adminEditDialog.getByLabel("Nueva contraseña").fill(adminEditedPassword);
	await adminEditDialog.getByRole("button", { name: "Guardar cambios" }).click();
	await expect(adminEditDialog).not.toBeVisible();
	await expect(page.getByText(adminEditedDisplayName, { exact: true })).toBeVisible();
	await expect(page.getByText(`@${adminEditedUsername}`, { exact: true })).toBeVisible();

	await page.context().clearCookies();
	await signIn(page, adminEditedUsername, adminEditedPassword);
});

test("lets an admin create users and other admins while protecting root", async ({ page }) => {
	const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
	const adminUsername = `admin-${suffix}`;
	const userUsername = `user-${suffix}`;
	const secondAdminUsername = `other-${suffix}`;
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");

	await signIn(page, "root-e2e");
	await page.goto("/settings/users");
	await expect(page.getByText("Root", { exact: true })).toBeVisible();
	await expect(page.getByText("Protegido", { exact: true })).toBeVisible();

	await page.getByLabel("Nombre").fill("Administradora temporal");
	await page.getByLabel("Usuario", { exact: true }).fill(adminUsername);
	await page.getByLabel("Rol", { exact: true }).selectOption("admin");
	await page.getByLabel("Contraseña inicial").fill(password);
	await page.getByRole("button", { name: "Crear acceso" }).click();
	await expect(page.getByText(`@${adminUsername}`, { exact: true })).toBeVisible();

	await page.context().clearCookies();
	await signIn(page, adminUsername);
	await page.goto("/settings/users");
	for (const [name, username, role] of [
		["Usuario temporal", userUsername, "user"],
		["Otra administradora", secondAdminUsername, "admin"],
	] as const) {
		await page.getByLabel("Nombre").fill(name);
		await page.getByLabel("Usuario", { exact: true }).fill(username);
		await page.getByLabel("Rol", { exact: true }).selectOption(role);
		if (role === "user") {
			await page.getByLabel("Correo", { exact: true }).fill(`${username}@example.com`);
		}
		await page.getByLabel("Contraseña inicial").fill(password);
		await page.getByRole("button", { name: "Crear acceso" }).click();
		await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
	}

	for (const name of ["Usuario temporal", "Otra administradora"]) {
		await page.getByRole("button", { name: `Eliminar a ${name}` }).click();
		await page.getByRole("button", { name: "Eliminar", exact: true }).click();
		await expect(page.getByText(name, { exact: true })).not.toBeVisible();
	}

	const payload = await page.evaluate(async () => {
		return (await (await fetch("/api/admin/users")).json()) as {
			users: Array<{ id: string; role: string }>;
		};
	});
	const root = payload.users.find((user) => user.role === "root");
	if (!root) throw new Error("Root fixture was not found.");
	const deleteRootStatus = await page.evaluate(async (rootId) => {
		return (await fetch(`/api/admin/users/${rootId}`, { method: "DELETE" })).status;
	}, root.id);
	expect(deleteRootStatus).toBe(409);
});
