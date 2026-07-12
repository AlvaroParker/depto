import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";

const origin = "http://127.0.0.1:3000";

async function register(page: import("@playwright/test").Page, name: string) {
	const response = await page.request.post("/oauth/register", {
		data: {
			client_name: name,
			grant_types: ["authorization_code", "refresh_token"],
			redirect_uris: [`${origin}/oauth/callback`],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		},
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as { client_id: string };
}

function authorizationUrl(clientId: string, state: string) {
	return `/oauth/authorize?${new URLSearchParams({
		client_id: clientId,
		code_challenge: "a".repeat(43),
		code_challenge_method: "S256",
		redirect_uri: `${origin}/oauth/callback`,
		resource: origin,
		response_type: "code",
		scope: "expenses:read offline_access",
		state,
	}).toString()}`;
}

test("approves, denies, lists, and disconnects OAuth applications", async ({ page }) => {
	await signIn(page, "alvaro");

	const deniedName = uniqueName("Cliente rechazado");
	const denied = await register(page, deniedName);
	await page.goto(authorizationUrl(denied.client_id, "deny-state"));
	await expect(page.getByRole("heading", { name: `¿Conectar ${deniedName}?` })).toBeVisible();
	await page.getByRole("button", { name: "Cancelar" }).click();
	await expect(page).toHaveURL(/\/oauth\/callback\?error=access_denied&state=deny-state/);

	const approvedName = uniqueName("Cliente aprobado");
	const approved = await register(page, approvedName);
	await page.goto(authorizationUrl(approved.client_id, "approve-state"));
	await expect(page.getByText("Permisos solicitados", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Permitir conexión" }).click();
	await expect(page).toHaveURL(/\/oauth\/callback\?code=[A-Za-z0-9_-]+&state=approve-state/);

	await page.goto("/settings");
	await expect(page.getByRole("heading", { name: "Aplicaciones conectadas" })).toBeVisible();
	const application = page.getByRole("listitem").filter({ hasText: approvedName });
	await expect(application).toContainText("Lectura de gastos");
	page.once("dialog", (dialog) => dialog.accept());
	await application.getByRole("button", { name: "Desconectar" }).click();
	await expect(page.getByText(approvedName)).not.toBeVisible();
	await expect(page.getByText(deniedName)).not.toBeVisible();
});
