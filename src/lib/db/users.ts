import "server-only";

import type { Result } from "ts-results";
import { isUserRole, type ManageableUserRole, type UserRole } from "@/lib/const/roles";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	AppUser,
	BootstrapRootInput,
	CreateManagedUserInput,
	ManagedUser,
	UpdateManagedUserInput,
} from "@/lib/types/user";
import { createId } from "@/lib/util/ids";
import { hashPassword } from "@/lib/util/password";

interface AppUserRow {
	created_at: string;
	disabled_at: string | null;
	display_name: string;
	id: string;
	participant_id: string | null;
	password_hash: string;
	role: string;
	username: string;
}

export type DisableUserOutcome =
	| { kind: "disabled" }
	| { kind: "not_found" }
	| { kind: "root_protected" }
	| { kind: "self_protected" };

export type UpdateManagedUserOutcome =
	| { kind: "not_found" }
	| { kind: "role_protected" }
	| { kind: "updated"; user: ManagedUser }
	| { kind: "username_taken" };

const APP_USER_COLUMNS = `
	id,
	username,
	password_hash,
	display_name,
	participant_id,
	role,
	created_at,
	disabled_at
`;

export function normalizeUsername(username: string): string {
	return username.trim().toLocaleLowerCase("es-CL");
}

function parseRole(role: string): UserRole {
	if (!isUserRole(role)) throw new Error(`Unknown user role: ${role}`);
	return role;
}

function mapAppUser(row: AppUserRow): AppUser {
	return {
		disabledAt: row.disabled_at,
		displayName: row.display_name,
		id: row.id,
		participantId: row.participant_id,
		passwordHash: row.password_hash,
		role: parseRole(row.role),
		username: row.username,
	};
}

function mapManagedUser(row: AppUserRow): ManagedUser {
	return {
		createdAt: row.created_at,
		disabledAt: row.disabled_at,
		displayName: row.display_name,
		id: row.id,
		role: parseRole(row.role),
		username: row.username,
	};
}

export async function findAppUserByUsername(
	username: string,
	database: D1Database = getDatabase(),
): Promise<Result<AppUser | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT ${APP_USER_COLUMNS}
				 FROM app_users
				 WHERE username = ? COLLATE NOCASE`,
			)
			.bind(normalizeUsername(username))
			.first<AppUserRow>();
		return row ? mapAppUser(row) : null;
	});
}

export async function findAppUserById(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<AppUser | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(`SELECT ${APP_USER_COLUMNS} FROM app_users WHERE id = ?`)
			.bind(id)
			.first<AppUserRow>();
		return row ? mapAppUser(row) : null;
	});
}

export async function hasRootUser(
	database: D1Database = getDatabase(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare("SELECT 1 AS present FROM app_users WHERE role = 'root' LIMIT 1")
			.first<{ present: number }>();
		return row?.present === 1;
	});
}

export async function listManagedUsers(
	database: D1Database = getDatabase(),
): Promise<Result<ManagedUser[], DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				`SELECT ${APP_USER_COLUMNS}
				 FROM app_users
				 WHERE disabled_at IS NULL
				 ORDER BY CASE role WHEN 'root' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
				          lower(display_name),
				          lower(username)`,
			)
			.all<AppUserRow>();
		return result.results.map(mapManagedUser);
	});
}

async function insertUser(
	input: Pick<BootstrapRootInput, "displayName" | "password" | "username">,
	role: UserRole,
	database: D1Database,
): Promise<ManagedUser> {
	const id = createId();
	const now = new Date().toISOString();
	const passwordHash = await hashPassword(input.password);
	const username = normalizeUsername(input.username);
	await database
		.prepare(
			`INSERT INTO app_users
			 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at, disabled_at)
			 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)`,
		)
		.bind(id, username, passwordHash, input.displayName.trim(), role, now, now)
		.run();
	return {
		createdAt: now,
		disabledAt: null,
		displayName: input.displayName.trim(),
		id,
		role,
		username,
	};
}

export async function createRootUser(
	input: BootstrapRootInput,
	database: D1Database = getDatabase(),
): Promise<Result<ManagedUser, DbError>> {
	return safeDbCall(() => insertUser(input, "root", database));
}

export async function createManagedUser(
	input: CreateManagedUserInput & { role: ManageableUserRole },
	database: D1Database = getDatabase(),
): Promise<Result<ManagedUser, DbError>> {
	return safeDbCall(() => insertUser(input, input.role, database));
}

export async function updateManagedUser(
	id: string,
	input: UpdateManagedUserInput,
	database: D1Database = getDatabase(),
): Promise<Result<UpdateManagedUserOutcome, DbError>> {
	return safeDbCall(async () => {
		const target = await database
			.prepare(`SELECT ${APP_USER_COLUMNS} FROM app_users WHERE id = ?`)
			.bind(id)
			.first<AppUserRow>();
		if (!target || target.disabled_at) return { kind: "not_found" };
		if (target.role !== "user") return { kind: "role_protected" };

		const displayName = input.displayName.trim();
		const passwordHash = input.password ? await hashPassword(input.password) : target.password_hash;
		const username = normalizeUsername(input.username);
		const now = new Date().toISOString();
		const updated = await database
			.prepare(
				`UPDATE OR IGNORE app_users
				 SET username = ?, display_name = ?, password_hash = ?, updated_at = ?
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL`,
			)
			.bind(username, displayName, passwordHash, now, id)
			.run();
		if (updated.meta.changes !== 1) return { kind: "username_taken" };

		return {
			kind: "updated",
			user: {
				createdAt: target.created_at,
				disabledAt: null,
				displayName,
				id,
				role: "user",
				username,
			},
		};
	});
}

export async function disableManagedUser(
	id: string,
	actorId: string,
	database: D1Database = getDatabase(),
): Promise<Result<DisableUserOutcome, DbError>> {
	return safeDbCall(async () => {
		const target = await database
			.prepare("SELECT id, role, disabled_at FROM app_users WHERE id = ?")
			.bind(id)
			.first<{ disabled_at: string | null; id: string; role: string }>();
		if (!target || target.disabled_at) return { kind: "not_found" };
		if (target.role === "root") return { kind: "root_protected" };
		if (target.id === actorId) return { kind: "self_protected" };

		const now = new Date().toISOString();
		await database
			.prepare("UPDATE app_users SET disabled_at = ?, updated_at = ? WHERE id = ?")
			.bind(now, now, id)
			.run();
		return { kind: "disabled" };
	});
}
