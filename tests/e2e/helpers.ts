import type { Page } from "@playwright/test";

export async function signIn(page: Page, username = "alvaro", passwordOverride?: string) {
	const password = passwordOverride ?? process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	await page.goto("/login");
	await page.getByLabel("Usuario").fill(username);
	await page.getByLabel("Contraseña").fill(password);
	await page.getByRole("button", { name: "Ingresar" }).click();
	await page.waitForURL("/");
}

export function uniqueName(prefix: string): string {
	return `${prefix} ${Date.now()}-${Math.round(Math.random() * 10_000)}`;
}
