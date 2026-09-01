import { request } from "@playwright/test";

export default async function globalSetup(): Promise<void> {
	if (process.env.E2E_BOOTSTRAP) return;
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error("E2E_PASSWORD was not configured.");
	const context = await request.newContext({
		baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
	});
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
		for (const [username, displayName, email] of [
			["alvaro", "Alvaro", "alvaro@example.com"],
			["camila", "Camila", "camila@example.com"],
			["trinidad", "Trinidad", "trinidad@example.com"],
		] as const) {
			const response = await context.post("/api/admin/users", {
				data: { displayName, email, password, role: "user", username },
			});
			if (!response.ok()) throw new Error(`Could not create E2E user ${username}.`);
			const payload = (await response.json()) as {
				user: { participantId: string | null };
			};
			if (!payload.user.participantId) throw new Error(`Missing participant for ${username}.`);
			const bankAccount =
				username === "alvaro"
					? {
							accountNumber: "001234567",
							accountType: "Cuenta Corriente",
							bankName: "Banco de Chile",
							rut: "18.972.631-7",
						}
					: username === "camila"
						? {
								accountNumber: "009068826",
								accountType: "Cuenta Vista",
								bankName: "Banco Estado",
								rut: "9.068.826-K",
							}
						: {
								accountNumber: "778899",
								accountType: "Cuenta de Ahorro",
								bankName: "Banco del Hogar",
								rut: "18.972.631-7",
							};
			const accountResponse = await context.put(
				`/api/admin/participants/${payload.user.participantId}/bank-account`,
				{ data: bankAccount },
			);
			if (!accountResponse.ok()) throw new Error(`Could not create bank account for ${username}.`);
		}
	} finally {
		await context.dispose();
	}
}
