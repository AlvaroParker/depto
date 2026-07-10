export const USER_ROLES = ["root", "admin", "user"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const MANAGEABLE_USER_ROLES = ["admin", "user"] as const;

export type ManageableUserRole = (typeof MANAGEABLE_USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
	admin: "Administrador",
	root: "Root",
	user: "Usuario",
};

export function canManageUsers(role: UserRole): boolean {
	return role === "root" || role === "admin";
}

export function isUserRole(value: unknown): value is UserRole {
	return typeof value === "string" && USER_ROLES.some((role) => role === value);
}
