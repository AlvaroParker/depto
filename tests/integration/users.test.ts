import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createManagedUser,
	createRootUser,
	disableManagedUser,
	hasRootUser,
	listManagedUsers,
} from "@/lib/db/users";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

describe("bootstrap and managed users", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
	});

	afterEach(async () => {
		await bindings.dispose();
	});

	it("creates exactly one root user", async () => {
		const before = await hasRootUser(bindings.database);
		expect(before.ok && before.val).toBe(false);

		const first = await createRootUser(
			{
				displayName: "Dueña de la casa",
				password: "clave-root-segura",
				passwordConfirmation: "clave-root-segura",
				username: "root",
			},
			bindings.database,
		);
		expect(first.ok).toBe(true);
		expect(first.ok && first.val.role).toBe("root");

		const second = await createRootUser(
			{
				displayName: "Otro root",
				password: "otra-clave-segura",
				passwordConfirmation: "otra-clave-segura",
				username: "otro-root",
			},
			bindings.database,
		);
		expect(second.err).toBe(true);
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'root'")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});

	it("protects root at both the service and database layers", async () => {
		const root = await createRootUser(
			{
				displayName: "Root",
				password: "clave-root-segura",
				passwordConfirmation: "clave-root-segura",
				username: "root",
			},
			bindings.database,
		);
		if (root.err) throw root.val;

		const disabled = await disableManagedUser(root.val.id, "someone-else", bindings.database);
		expect(disabled.ok && disabled.val.kind).toBe("root_protected");
		await expect(
			bindings.database.prepare("DELETE FROM app_users WHERE id = ?").bind(root.val.id).run(),
		).rejects.toThrow(/root user cannot be deleted/i);
		await expect(
			bindings.database
				.prepare("UPDATE app_users SET disabled_at = ? WHERE id = ?")
				.bind(new Date().toISOString(), root.val.id)
				.run(),
		).rejects.toThrow(/active status are immutable/i);
	});

	it("lets a manager create admins and users and disable other accounts", async () => {
		const admin = await createManagedUser(
			{
				displayName: "Administradora",
				password: "clave-admin-segura",
				role: "admin",
				username: "admin",
			},
			bindings.database,
		);
		const user = await createManagedUser(
			{
				displayName: "Invitada",
				password: "clave-user-segura",
				role: "user",
				username: "invitada",
			},
			bindings.database,
		);
		if (admin.err || user.err) throw new Error("Could not create fixtures.");

		const listed = await listManagedUsers(bindings.database);
		expect(listed.ok && listed.val.map(({ role }) => role)).toEqual(["admin", "user"]);

		const disabled = await disableManagedUser(user.val.id, admin.val.id, bindings.database);
		expect(disabled.ok && disabled.val.kind).toBe("disabled");
		const after = await listManagedUsers(bindings.database);
		expect(after.ok && after.val.map(({ username }) => username)).toEqual(["admin"]);

		const self = await disableManagedUser(admin.val.id, admin.val.id, bindings.database);
		expect(self.ok && self.val.kind).toBe("self_protected");
	});
});
