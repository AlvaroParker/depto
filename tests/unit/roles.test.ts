import { describe, expect, it } from "vitest";
import { canManageUsers, isUserRole } from "@/lib/const/roles";
import { CreateManagedUserInputSchema, UpdateManagedUserInputSchema } from "@/lib/types/user";

describe("role-based access control", () => {
	it("allows root and admins to manage users but not regular users", () => {
		expect(canManageUsers("root")).toBe(true);
		expect(canManageUsers("admin")).toBe(true);
		expect(canManageUsers("user")).toBe(false);
	});

	it("recognizes exactly the three persisted roles", () => {
		expect(["root", "admin", "user"].every(isUserRole)).toBe(true);
		expect(isUserRole("owner")).toBe(false);
		expect(isUserRole(["admin", "user"])).toBe(false);
	});

	it("never accepts root as a role through regular user creation", () => {
		const result = CreateManagedUserInputSchema.safeParse({
			displayName: "Segundo root",
			password: "una-clave-muy-segura",
			role: "root",
			username: "segundo-root",
		});
		expect(result.success).toBe(false);
	});

	it("allows password-preserving edits but validates a supplied replacement password", () => {
		expect(
			UpdateManagedUserInputSchema.safeParse({
				displayName: "Nombre actualizado",
				username: "usuario-actualizado",
			}).success,
		).toBe(true);
		expect(
			UpdateManagedUserInputSchema.safeParse({
				displayName: "Nombre actualizado",
				password: "muy-corta",
				username: "usuario-actualizado",
			}).success,
		).toBe(false);
	});
});
