import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	BankAccountType,
	BankTransferDetails,
	ParticipantBankAccount,
	ParticipantBankAccountInput,
} from "@/lib/types/bank-account";

interface BankAccountRow {
	account_number: string;
	account_type: BankAccountType;
	bank_name: string;
	created_at: string;
	participant_id: string;
	rut: string;
	updated_at: string;
}

interface BankTransferDetailsRow extends BankAccountRow {
	email: string;
	name: string;
}

export type UpsertBankAccountOutcome =
	{ kind: "not_found" } | { bankAccount: ParticipantBankAccount; kind: "updated" };

export type DeleteBankAccountOutcome =
	{ kind: "deleted" } | { kind: "not_found" } | { kind: "no_account" };

function mapBankAccount(row: BankAccountRow): ParticipantBankAccount {
	return {
		accountNumber: row.account_number,
		accountType: row.account_type,
		bankName: row.bank_name,
		createdAt: row.created_at,
		participantId: row.participant_id,
		rut: row.rut,
		updatedAt: row.updated_at,
	};
}

function mapTransferDetails(row: BankTransferDetailsRow): BankTransferDetails {
	return {
		accountNumber: row.account_number,
		accountType: row.account_type,
		bankName: row.bank_name,
		email: row.email,
		name: row.name,
		participantId: row.participant_id,
		rut: row.rut,
	};
}

async function isManageableParticipant(
	participantId: string,
	database: D1Database,
): Promise<boolean> {
	const row = await database
		.prepare(
			`SELECT 1 AS present
			 FROM participants p
			 JOIN app_users u ON u.participant_id = p.id
			 WHERE p.id = ? AND p.active = 1 AND u.role = 'user' AND u.disabled_at IS NULL`,
		)
		.bind(participantId)
		.first<{ present: number }>();
	return row?.present === 1;
}

export async function findParticipantBankAccount(
	participantId: string,
	database: D1Database = getDatabase(),
): Promise<Result<ParticipantBankAccount | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT participant_id, rut, account_type, account_number, bank_name,
				        created_at, updated_at
				 FROM participant_bank_accounts
				 WHERE participant_id = ?`,
			)
			.bind(participantId)
			.first<BankAccountRow>();
		return row ? mapBankAccount(row) : null;
	});
}

export async function findBankTransferDetails(
	participantId: string,
	database: D1Database = getDatabase(),
): Promise<Result<BankTransferDetails | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT a.participant_id, a.rut, a.account_type, a.account_number,
				        a.bank_name, a.created_at, a.updated_at, p.name, p.email
				 FROM participant_bank_accounts a
				 JOIN participants p ON p.id = a.participant_id
				 WHERE a.participant_id = ? AND p.email IS NOT NULL`,
			)
			.bind(participantId)
			.first<BankTransferDetailsRow>();
		return row ? mapTransferDetails(row) : null;
	});
}

export async function findBankTransferDetailsByParticipantIds(
	participantIds: string[],
	database: D1Database = getDatabase(),
): Promise<Result<Record<string, BankTransferDetails>, DbError>> {
	return safeDbCall(async () => {
		const uniqueIds = [...new Set(participantIds)];
		if (!uniqueIds.length) return {};
		const placeholders = uniqueIds.map(() => "?").join(", ");
		const result = await database
			.prepare(
				`SELECT a.participant_id, a.rut, a.account_type, a.account_number,
				        a.bank_name, a.created_at, a.updated_at, p.name, p.email
				 FROM participant_bank_accounts a
				 JOIN participants p ON p.id = a.participant_id
				 WHERE a.participant_id IN (${placeholders}) AND p.email IS NOT NULL`,
			)
			.bind(...uniqueIds)
			.all<BankTransferDetailsRow>();
		return Object.fromEntries(
			result.results.map((row) => [row.participant_id, mapTransferDetails(row)]),
		);
	});
}

export async function upsertParticipantBankAccount(
	participantId: string,
	input: ParticipantBankAccountInput,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<UpsertBankAccountOutcome, DbError>> {
	return safeDbCall(async () => {
		if (!(await isManageableParticipant(participantId, database))) return { kind: "not_found" };
		const timestamp = now.toISOString();
		await database
			.prepare(
				`INSERT INTO participant_bank_accounts
				 (participant_id, rut, account_type, account_number, bank_name, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(participant_id) DO UPDATE SET
				   rut = excluded.rut,
				   account_type = excluded.account_type,
				   account_number = excluded.account_number,
				   bank_name = excluded.bank_name,
				   updated_at = excluded.updated_at`,
			)
			.bind(
				participantId,
				input.rut,
				input.accountType,
				input.accountNumber,
				input.bankName,
				timestamp,
				timestamp,
			)
			.run();
		const saved = await database
			.prepare(
				`SELECT participant_id, rut, account_type, account_number, bank_name,
				        created_at, updated_at
				 FROM participant_bank_accounts WHERE participant_id = ?`,
			)
			.bind(participantId)
			.first<BankAccountRow>();
		if (!saved) throw new Error("Bank account was not saved.");
		return { bankAccount: mapBankAccount(saved), kind: "updated" };
	});
}

export async function deleteParticipantBankAccount(
	participantId: string,
	database: D1Database = getDatabase(),
): Promise<Result<DeleteBankAccountOutcome, DbError>> {
	return safeDbCall(async () => {
		if (!(await isManageableParticipant(participantId, database))) return { kind: "not_found" };
		const deleted = await database
			.prepare("DELETE FROM participant_bank_accounts WHERE participant_id = ?")
			.bind(participantId)
			.run();
		return deleted.meta.changes ? { kind: "deleted" } : { kind: "no_account" };
	});
}
