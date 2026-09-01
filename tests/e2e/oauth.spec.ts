import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./helpers";
import { expectNoHorizontalOverflow, expectNoHorizontalOverflowWithin } from "./ui-quality";

async function register(page: import("@playwright/test").Page, name: string, origin: string) {
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

function authorizationUrl(clientId: string, state: string, origin: string) {
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
	const origin = new URL(page.url()).origin;
	await page.setViewportSize({ height: 700, width: 200 });

	const deniedName = "ClienteExtraordinariamenteLargo".repeat(4).slice(0, 100);
	const denied = await register(page, deniedName, origin);
	await page.goto(authorizationUrl(denied.client_id, "deny-state", origin));
	await expect(page.getByRole("heading", { name: `¿Conectar ${deniedName}?` })).toBeVisible();
	await expectNoHorizontalOverflow(page, "OAuth consent with a 100-character client name");
	await page.getByRole("button", { name: "Cancelar" }).click();
	await expect(page).toHaveURL(/\/oauth\/callback\?error=access_denied&state=deny-state/);

	const approvedName = uniqueName("Cliente aprobado");
	const approved = await register(page, approvedName, origin);
	await page.goto(authorizationUrl(approved.client_id, "approve-state", origin));
	await expect(page.getByText("Permisos solicitados", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Permitir conexión" }).click();
	await expect(page).toHaveURL(/\/oauth\/callback\?code=[A-Za-z0-9_-]+&state=approve-state/);

	await page.goto("/settings");
	await expect(page.getByRole("heading", { name: "Aplicaciones conectadas" })).toBeVisible();
	await expectNoHorizontalOverflow(page, "connected applications at 200x700");
	const application = page.getByRole("listitem").filter({ hasText: approvedName });
	await expect(application).toContainText("Lectura de gastos");
	await application.getByRole("button", { name: "Desconectar aplicación" }).click();
	const disconnectDialog = page.getByRole("dialog", { name: "Desconectar aplicación" });
	await expect(disconnectDialog).toContainText(approvedName);
	await expectNoHorizontalOverflowWithin(disconnectDialog, "disconnect dialog at 200x700");
	await disconnectDialog.getByRole("button", { name: "Desconectar aplicación" }).click();
	const notice = page.getByRole("status");
	await expect(notice).toHaveText(`La aplicación ${approvedName} fue desconectada.`);
	await expect(notice).toBeFocused();
	await expect(application).not.toBeVisible();
	await expect(page.getByText(deniedName)).not.toBeVisible();
});
