import { z } from "zod";
import type { UserRole } from "@/lib/const/roles";
import type { ParticipantBankAccount } from "@/lib/types/bank-account";

export interface AppUser {
	id: string;
	username: string;
	passwordHash: string;
	displayName: string;
	participantId: string | null;
	role: UserRole;
	disabledAt: string | null;
}

export interface SessionUser {
	id: string;
	username: string;
	displayName: string;
	participantId: string | null;
	role: UserRole;
}

export interface ManagedUser {
	bankAccount: ParticipantBankAccount | null;
	createdAt: string;
	disabledAt: string | null;
	displayName: string;
	email: string | null;
	id: string;
	participantId: string | null;
	role: UserRole;
	username: string;
}

const usernameSchema = z
	.string()
	.trim()
	.min(3, "El usuario debe tener al menos 3 caracteres.")
	.max(32, "El usuario no puede superar los 32 caracteres.")
	.regex(/^[a-zA-Z0-9._-]+$/, "Usa solamente letras, números, puntos, guiones y guiones bajos.");

const passwordSchema = z
	.string()
	.min(12, "La contraseña debe tener al menos 12 caracteres.")
	.max(128, "La contraseña no puede superar los 128 caracteres.");

const displayNameSchema = z
	.string()
	.trim()
	.min(1, "Ingresa un nombre.")
	.max(80, "El nombre no puede superar los 80 caracteres.");

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.email("Ingresa un correo válido.")
	.max(254, "El correo no puede superar los 254 caracteres.");

export const BootstrapRootInputSchema = z
	.object({
		displayName: displayNameSchema,
		password: passwordSchema,
		passwordConfirmation: z.string(),
		username: usernameSchema,
	})
	.refine((input) => input.password === input.passwordConfirmation, {
		message: "Las contraseñas no coinciden.",
		path: ["passwordConfirmation"],
	});

export interface BootstrapRootInput {
	displayName: string;
	password: string;
	passwordConfirmation: string;
	username: string;
}

export const CreateManagedUserInputSchema = z.discriminatedUnion("role", [
	z.object({
		displayName: displayNameSchema,
		email: emailSchema,
		password: passwordSchema,
		role: z.literal("user"),
		username: usernameSchema,
	}),
	z.object({
		displayName: displayNameSchema,
		email: z.undefined().optional(),
		password: passwordSchema,
		role: z.literal("admin"),
		username: usernameSchema,
	}),
]);

export type CreateManagedUserInput = z.infer<typeof CreateManagedUserInputSchema>;

export const UpdateManagedUserInputSchema = z.object({
	displayName: displayNameSchema,
	email: emailSchema,
	password: passwordSchema.optional(),
	username: usernameSchema,
});

export interface UpdateManagedUserInput extends z.infer<typeof UpdateManagedUserInputSchema> {
	password?: string;
}

export interface ManagedUserResponse {
	user: ManagedUser;
}

export interface BootstrapStatus {
	needsBootstrap: boolean;
}

export interface UserListResponse {
	users: ManagedUser[];
}

export type LoginAttemptScope = "username" | "ip";

export interface LoginAttempt {
	scope: LoginAttemptScope;
	keyHash: string;
	attemptCount: number;
	windowStartedAt: string;
	lockedUntil: string | null;
	updatedAt: string;
}
