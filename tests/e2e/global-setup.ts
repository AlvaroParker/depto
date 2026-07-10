import { request } from "@playwright/test";

export default async function globalSetup(): Promise<void> {
	if (process.env.E2E_BOOTSTRAP) return;
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	const context = await request.newContext({ baseURL: "http://127.0.0.1:3000" });
	try {
		const bootstrap = await context.post("/api/bootstrap", {
			data: {
				displayName: "Administradora E2E",
				password,
				passwordConfirmation: password,
				username: "root-e2e",
			},
		});
		if (!bootstrap.ok()) throw new Error("Could not bootstrap the E2E root user.");
		const csrfResponse = await context.get("/api/auth/csrf");
		const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
		const signIn = await context.post("/api/auth/callback/credentials", {
			form: { callbackUrl: "/", csrfToken, password, username: "root-e2e" },
		});
		if (!signIn.ok()) throw new Error("Could not authenticate the E2E root user.");
		for (const [username, displayName] of [
			["alvaro", "Alvaro"],
			["camila", "Camila"],
			["trinidad", "Trinidad"],
		] as const) {
			const response = await context.post("/api/admin/users", {
				data: { displayName, password, role: "user", username },
			});
			if (!response.ok()) throw new Error(`Could not create E2E user ${username}.`);
		}
	} finally {
		await context.dispose();
	}
}
