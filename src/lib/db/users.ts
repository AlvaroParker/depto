import "server-only";

import type { Result } from "ts-results";
import { isUserRole, type UserRole } from "@/lib/const/roles";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { BankAccountType, ParticipantBankAccount } from "@/lib/types/bank-account";
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
	participant_email: string | null;
	id: string;
	participant_id: string | null;
	password_hash: string;
	role: string;
	username: string;
}

interface ManagedUserRow extends AppUserRow {
	bank_account_number: string | null;
	bank_account_type: BankAccountType | null;
	bank_created_at: string | null;
	bank_name: string | null;
	bank_rut: string | null;
	bank_updated_at: string | null;
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
	| { kind: "email_taken" }
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
	, (SELECT email FROM participants WHERE id = app_users.participant_id) AS participant_email
`;

const MANAGED_USER_COLUMNS = `${APP_USER_COLUMNS},
	(SELECT rut FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_rut,
	(SELECT account_type FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_account_type,
	(SELECT account_number FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_account_number,
	(SELECT bank_name FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_name,
	(SELECT created_at FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_created_at,
	(SELECT updated_at FROM participant_bank_accounts WHERE participant_id = app_users.participant_id) AS bank_updated_at
`;

export function normalizeUsername(username: string): string {
	return username.trim().toLocaleLowerCase("es-CL");
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
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

function mapManagedBankAccount(row: ManagedUserRow): ParticipantBankAccount | null {
	if (
		!row.participant_id ||
		!row.bank_rut ||
		!row.bank_account_type ||
		!row.bank_account_number ||
		!row.bank_name ||
		!row.bank_created_at ||
		!row.bank_updated_at
	) {
		return null;
	}
	return {
		accountNumber: row.bank_account_number,
		accountType: row.bank_account_type,
		bankName: row.bank_name,
		createdAt: row.bank_created_at,
		participantId: row.participant_id,
		rut: row.bank_rut,
		updatedAt: row.bank_updated_at,
	};
}

function mapManagedUser(row: ManagedUserRow): ManagedUser {
	return {
		bankAccount: mapManagedBankAccount(row),
		createdAt: row.created_at,
		disabledAt: row.disabled_at,
		displayName: row.display_name,
		email: row.participant_email,
		id: row.id,
		participantId: row.participant_id,
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
				`SELECT ${MANAGED_USER_COLUMNS}
				 FROM app_users
				 WHERE disabled_at IS NULL
				 ORDER BY CASE role WHEN 'root' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
				          lower(display_name),
				          lower(username)`,
			)
			.all<ManagedUserRow>();
		return result.results.map(mapManagedUser);
	});
}

async function insertUser(
	input: Pick<BootstrapRootInput, "displayName" | "password" | "username"> & { email?: string },
	role: UserRole,
	database: D1Database,
): Promise<ManagedUser> {
	const id = createId();
	const now = new Date().toISOString();
	const passwordHash = await hashPassword(input.password);
	const username = normalizeUsername(input.username);
	const participantId = role === "user" ? createId() : null;
	const statements: D1PreparedStatement[] = [];
	if (participantId) {
		statements.push(
			database
				.prepare(
					`INSERT INTO participants
					 (id, name, slug, email, sort_order, active, created_at, updated_at)
					 SELECT ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, 0, ?, ?
					 FROM participants`,
				)
				.bind(
					participantId,
					input.displayName.trim(),
					`user-${participantId}`,
					input.email ? normalizeEmail(input.email) : null,
					now,
					now,
				),
		);
	}
	statements.push(
		database
			.prepare(
				`INSERT INTO app_users
			 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at, disabled_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
			)
			.bind(id, username, passwordHash, input.displayName.trim(), participantId, role, now, now),
	);
	await database.batch(statements);
	return {
		bankAccount: null,
		createdAt: now,
		disabledAt: null,
		displayName: input.displayName.trim(),
		email: participantId && input.email ? normalizeEmail(input.email) : null,
		id,
		participantId,
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
	input: CreateManagedUserInput,
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
			.prepare(`SELECT ${MANAGED_USER_COLUMNS} FROM app_users WHERE id = ?`)
			.bind(id)
			.first<ManagedUserRow>();
		if (!target || target.disabled_at) return { kind: "not_found" };
		if (target.role !== "user") return { kind: "role_protected" };

		const displayName = input.displayName.trim();
		const email = normalizeEmail(input.email);
		const passwordHash = input.password ? await hashPassword(input.password) : target.password_hash;
		const username = normalizeUsername(input.username);
		const now = new Date().toISOString();
		const usernameOwner = await database
			.prepare("SELECT id FROM app_users WHERE username = ? COLLATE NOCASE AND id <> ?")
			.bind(username, id)
			.first<{ id: string }>();
		if (usernameOwner) return { kind: "username_taken" };
		const emailOwner = await database
			.prepare("SELECT id FROM participants WHERE email = ? COLLATE NOCASE AND id <> ?")
			.bind(email, target.participant_id)
			.first<{ id: string }>();
		if (emailOwner) return { kind: "email_taken" };

		const [updated] = await database.batch([
			database
				.prepare(
					`UPDATE app_users
				 SET username = ?, display_name = ?, password_hash = ?, updated_at = ?
				 WHERE id = ? AND role = 'user' AND disabled_at IS NULL`,
				)
				.bind(username, displayName, passwordHash, now, id),
			database
				.prepare("UPDATE participants SET email = ?, updated_at = ? WHERE id = ?")
				.bind(email, now, target.participant_id),
		]);
		if (updated.meta.changes === 0) return { kind: "not_found" };

		return {
			kind: "updated",
			user: {
				bankAccount: mapManagedBankAccount(target),
				createdAt: target.created_at,
				disabledAt: null,
				displayName,
				email,
				id,
				participantId: target.participant_id,
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
