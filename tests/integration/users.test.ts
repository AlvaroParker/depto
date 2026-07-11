import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createManagedUser,
	createRootUser,
	disableManagedUser,
	findAppUserByUsername,
	hasRootUser,
	listManagedUsers,
	updateManagedUser,
} from "@/lib/db/users";
import { verifyPassword } from "@/lib/util/password";
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
				email: "invitada@example.com",
				password: "clave-user-segura",
				role: "user",
				username: "invitada",
			},
			bindings.database,
		);
		if (admin.err || user.err) throw new Error("Could not create fixtures.");
		expect(admin.val.participantId).toBeNull();
		expect(user.val.participantId).not.toBeNull();
		const participant = await bindings.database
			.prepare("SELECT name, email, active FROM participants WHERE id = ?")
			.bind(user.val.participantId)
			.first<{ active: number; email: string; name: string }>();
		expect(participant).toEqual({ active: 1, email: "invitada@example.com", name: "Invitada" });

		const listed = await listManagedUsers(bindings.database);
		expect(listed.ok && listed.val.map(({ role }) => role)).toEqual(["admin", "user"]);

		const disabled = await disableManagedUser(user.val.id, admin.val.id, bindings.database);
		expect(disabled.ok && disabled.val.kind).toBe("disabled");
		const disabledParticipant = await bindings.database
			.prepare("SELECT active FROM participants WHERE id = ?")
			.bind(user.val.participantId)
			.first<{ active: number }>();
		expect(disabledParticipant?.active).toBe(0);
		const after = await listManagedUsers(bindings.database);
		expect(after.ok && after.val.map(({ username }) => username)).toEqual(["admin"]);

		const self = await disableManagedUser(admin.val.id, admin.val.id, bindings.database);
		expect(self.ok && self.val.kind).toBe("self_protected");
	});

	it("updates only regular users, preserving or replacing their password as requested", async () => {
		const originalPassword = "clave-user-original";
		const replacementPassword = "clave-user-renovada";
		const user = await createManagedUser(
			{
				displayName: "Invitada original",
				email: "original@example.com",
				password: originalPassword,
				role: "user",
				username: "invitada-original",
			},
			bindings.database,
		);
		const occupied = await createManagedUser(
			{
				displayName: "Usuario ocupado",
				email: "ocupado@example.com",
				password: "clave-user-ocupada",
				role: "user",
				username: "ocupado",
			},
			bindings.database,
		);
		if (user.err || occupied.err) throw new Error("Could not create user fixtures.");

		const renamed = await updateManagedUser(
			user.val.id,
			{
				displayName: "  Invitada renovada  ",
				email: "RENOVADA@EXAMPLE.COM",
				username: "INVITADA.NUEVA",
			},
			bindings.database,
		);
		expect(renamed.ok && renamed.val).toMatchObject({
			kind: "updated",
			user: { displayName: "Invitada renovada", username: "invitada.nueva" },
		});
		const renamedParticipant = await bindings.database
			.prepare("SELECT name, email FROM participants WHERE id = ?")
			.bind(user.val.participantId)
			.first<{ email: string; name: string }>();
		expect(renamedParticipant?.name).toBe("Invitada renovada");
		expect(renamedParticipant?.email).toBe("renovada@example.com");
		const afterRename = await findAppUserByUsername("invitada.nueva", bindings.database);
		expect(
			afterRename.ok &&
				afterRename.val &&
				(await verifyPassword(originalPassword, afterRename.val.passwordHash)),
		).toBe(true);

		const passwordChanged = await updateManagedUser(
			user.val.id,
			{
				displayName: "Invitada renovada",
				email: "renovada@example.com",
				password: replacementPassword,
				username: "invitada.nueva",
			},
			bindings.database,
		);
		expect(passwordChanged.ok && passwordChanged.val.kind).toBe("updated");
		const afterPasswordChange = await findAppUserByUsername("invitada.nueva", bindings.database);
		if (afterPasswordChange.err || !afterPasswordChange.val) {
			throw new Error("Updated user was not found.");
		}
		expect(await verifyPassword(originalPassword, afterPasswordChange.val.passwordHash)).toBe(
			false,
		);
		expect(await verifyPassword(replacementPassword, afterPasswordChange.val.passwordHash)).toBe(
			true,
		);

		const conflict = await updateManagedUser(
			user.val.id,
			{
				displayName: "Invitada renovada",
				email: "renovada@example.com",
				username: occupied.val.username,
			},
			bindings.database,
		);
		expect(conflict.ok && conflict.val.kind).toBe("username_taken");
		const emailConflict = await updateManagedUser(
			user.val.id,
			{
				displayName: "Invitada renovada",
				email: "OCUPADO@EXAMPLE.COM",
				username: "invitada.nueva",
			},
			bindings.database,
		);
		expect(emailConflict.ok && emailConflict.val.kind).toBe("email_taken");
		const afterConflicts = await bindings.database
			.prepare("SELECT email FROM participants WHERE id = ?")
			.bind(user.val.participantId)
			.first<{ email: string }>();
		expect(afterConflicts?.email).toBe("renovada@example.com");
	});

	it("protects root, admin, disabled, and missing accounts from profile edits", async () => {
		const root = await createRootUser(
			{
				displayName: "Root",
				password: "clave-root-segura",
				passwordConfirmation: "clave-root-segura",
				username: "root",
			},
			bindings.database,
		);
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
				email: "invitada-protegida@example.com",
				password: "clave-user-segura",
				role: "user",
				username: "invitada",
			},
			bindings.database,
		);
		if (root.err || admin.err || user.err) throw new Error("Could not create fixtures.");

		for (const id of [root.val.id, admin.val.id]) {
			const result = await updateManagedUser(
				id,
				{
					displayName: "No permitido",
					email: "no-permitido@example.com",
					username: "no-permitido",
				},
				bindings.database,
			);
			expect(result.ok && result.val.kind).toBe("role_protected");
		}

		await disableManagedUser(user.val.id, admin.val.id, bindings.database);
		const disabled = await updateManagedUser(
			user.val.id,
			{
				displayName: "No permitido",
				email: "deshabilitada@example.com",
				username: "deshabilitada",
			},
			bindings.database,
		);
		expect(disabled.ok && disabled.val.kind).toBe("not_found");

		const missing = await updateManagedUser(
			"missing-user",
			{
				displayName: "No existe",
				email: "no-existe@example.com",
				username: "no-existe",
			},
			bindings.database,
		);
		expect(missing.ok && missing.val.kind).toBe("not_found");
	});
});
