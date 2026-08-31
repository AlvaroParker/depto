import "server-only";

import type { Result } from "ts-results";
import type { UserRole } from "@/lib/const/roles";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { ExpenseShare, ExpenseSplitMode, ShareStatus } from "@/lib/types/expense";
import type { PaymentProofStorageMetadata, StoredPaymentProof } from "@/lib/types/payment-proof";

interface ShareRow {
	expense_amount_minor: number;
	expense_id: string;
	expense_payer_id: string;
	expense_split_mode: ExpenseSplitMode;
	id: string;
	marked_by_user_id: string | null;
	paid_at: string | null;
	paid_to_participant_id: string | null;
	participant_id: string;
	participant_name: string;
	participant_slug: string;
	participant_sort_order: number;
	proof_content_type: StoredPaymentProof["contentType"] | null;
	proof_filename: string | null;
	proof_object_key: string | null;
	proof_size_bytes: number | null;
	proof_uploaded_at: string | null;
	proof_uploaded_by_user_id: string | null;
	share_amount_minor: number;
	status: ShareStatus;
}

export interface ShareMutationActor {
	id: string;
	participantId: string | null;
	role: UserRole;
}

export type ShareMutation =
	| {
			kind: "updated";
			removedProofObjectKey: string | null;
			share: ExpenseShare;
	  }
	| { kind: "not_found" }
	| { kind: "payer_immutable" }
	| { kind: "zero_amount" }
	| { kind: "forbidden" };

export type PaymentProofMutation =
	| {
			kind: "updated";
			previousObjectKey: string | null;
			share: ExpenseShare;
	  }
	| { kind: "not_found" }
	| { kind: "payer_immutable" }
	| { kind: "zero_amount" }
	| { kind: "forbidden" };

export type ShareMutationAccess =
	| { kind: "allowed" }
	| { kind: "not_found" }
	| { kind: "payer_immutable" }
	| { kind: "zero_amount" }
	| { kind: "forbidden" };

export type OpenShareAmountMutation =
	| { kind: "updated"; shares: ExpenseShare[] }
	| { kind: "not_found" }
	| { kind: "not_open" }
	| { kind: "payer_immutable" }
	| { kind: "paid_locked" }
	| { kind: "amount_exceeds_total" }
	| { kind: "forbidden" };

const SHARE_SELECT = `
	SELECT s.id, s.expense_id, s.share_amount_minor, s.status, s.paid_to_participant_id,
	       s.paid_at, s.marked_by_user_id, p.id AS participant_id,
	       p.name AS participant_name, p.slug AS participant_slug,
	       p.sort_order AS participant_sort_order,
	       proof.object_key AS proof_object_key, proof.filename AS proof_filename,
	       proof.content_type AS proof_content_type, proof.size_bytes AS proof_size_bytes,
	       proof.uploaded_by_user_id AS proof_uploaded_by_user_id,
	       proof.uploaded_at AS proof_uploaded_at,
	       e.amount_minor AS expense_amount_minor,
	       e.paid_by_participant_id AS expense_payer_id,
	       e.split_mode AS expense_split_mode
	FROM expense_shares s
	JOIN expenses e ON e.id = s.expense_id AND e.deleted_at IS NULL
	JOIN participants p ON p.id = s.participant_id
	LEFT JOIN expense_share_payment_proofs proof ON proof.share_id = s.id`;

async function readShare(database: D1Database, id: string): Promise<ShareRow | null> {
	return database.prepare(`${SHARE_SELECT} WHERE s.id = ?`).bind(id).first<ShareRow>();
}

async function readExpenseShares(database: D1Database, expenseId: string): Promise<ShareRow[]> {
	const result = await database
		.prepare(`${SHARE_SELECT} WHERE s.expense_id = ? ORDER BY p.sort_order ASC`)
		.bind(expenseId)
		.all<ShareRow>();
	return result.results;
}

function mapStoredProof(row: ShareRow): StoredPaymentProof | null {
	if (
		!row.proof_object_key ||
		!row.proof_filename ||
		!row.proof_content_type ||
		!row.proof_size_bytes ||
		!row.proof_uploaded_at ||
		!row.proof_uploaded_by_user_id
	) {
		return null;
	}
	return {
		contentType: row.proof_content_type,
		filename: row.proof_filename,
		objectKey: row.proof_object_key,
		sizeBytes: row.proof_size_bytes,
		uploadedAt: row.proof_uploaded_at,
		uploadedByUserId: row.proof_uploaded_by_user_id,
	};
}

function mapShare(row: ShareRow): ExpenseShare {
	const proof = mapStoredProof(row);
	return {
		id: row.id,
		markedByUserId: row.marked_by_user_id,
		paidAt: row.paid_at,
		paidToParticipantId: row.paid_to_participant_id,
		participant: {
			id: row.participant_id,
			name: row.participant_name,
			slug: row.participant_slug,
			sortOrder: row.participant_sort_order,
		},
		paymentProof: proof
			? {
					contentType: proof.contentType,
					filename: proof.filename,
					sizeBytes: proof.sizeBytes,
					uploadedAt: proof.uploadedAt,
					uploadedByUserId: proof.uploadedByUserId,
				}
			: null,
		shareAmountMinor: row.share_amount_minor,
		status: row.status,
	};
}

function canMutateShare(row: ShareRow, actor: ShareMutationActor): boolean {
	return (
		actor.role === "root" || actor.role === "admin" || actor.participantId === row.participant_id
	);
}

function accessFor(row: ShareRow | null, actor: ShareMutationActor): ShareMutationAccess {
	if (!row) return { kind: "not_found" };
	if (row.status === "settled") return { kind: "payer_immutable" };
	if (!canMutateShare(row, actor)) return { kind: "forbidden" };
	if (row.share_amount_minor === 0) return { kind: "zero_amount" };
	return { kind: "allowed" };
}

export async function authorizeSharePaymentProofUpload(
	id: string,
	actor: ShareMutationActor,
	database: D1Database = getDatabase(),
): Promise<Result<ShareMutationAccess, DbError>> {
	return safeDbCall(async () => accessFor(await readShare(database, id), actor));
}

export async function findSharePaymentProof(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<StoredPaymentProof | null, DbError>> {
	return safeDbCall(async () => {
		const row = await readShare(database, id);
		return row ? mapStoredProof(row) : null;
	});
}

export async function countPaymentProofObjectReferences(
	objectKey: string,
	database: D1Database = getDatabase(),
): Promise<Result<number, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare("SELECT COUNT(*) AS total FROM expense_share_payment_proofs WHERE object_key = ?")
			.bind(objectKey)
			.first<{ total: number }>();
		return row?.total ?? 0;
	});
}

export async function findShareByExpenseAndParticipant(
	expenseId: string,
	participantId: string,
	database: D1Database = getDatabase(),
): Promise<Result<ExpenseShare | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(`${SHARE_SELECT} WHERE s.expense_id = ? AND s.participant_id = ?`)
			.bind(expenseId, participantId)
			.first<ShareRow>();
		return row ? mapShare(row) : null;
	});
}

export async function findExpenseIdForShare(
	shareId: string,
	database: D1Database = getDatabase(),
): Promise<Result<string | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT s.expense_id FROM expense_shares s
				 JOIN expenses e ON e.id = s.expense_id AND e.deleted_at IS NULL
				 WHERE s.id = ?`,
			)
			.bind(shareId)
			.first<{ expense_id: string }>();
		return row?.expense_id ?? null;
	});
}

export async function updateShareStatus(
	id: string,
	status: "pending" | "paid",
	actor: ShareMutationActor,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ShareMutation, DbError>> {
	return safeDbCall(async () => {
		const existing = await readShare(database, id);
		const access = accessFor(existing, actor);
		if (access.kind !== "allowed") return access;
		if (!existing) throw new Error("Allowed share access requires an existing share.");
		const proof = mapStoredProof(existing);
		if (existing.status === status) {
			return { kind: "updated", removedProofObjectKey: null, share: mapShare(existing) };
		}
		const timestamp = now.toISOString();
		const statements: D1PreparedStatement[] = [];
		if (status === "pending" && proof) {
			statements.push(
				database.prepare("DELETE FROM expense_share_payment_proofs WHERE share_id = ?").bind(id),
			);
		}
		statements.push(
			database
				.prepare(
					`UPDATE expense_shares
					 SET status = ?, paid_at = ?, marked_by_user_id = ?, updated_at = ?,
					     bulk_payment_id = NULL
					 WHERE id = ? AND status != 'settled'`,
				)
				.bind(
					status,
					status === "paid" ? timestamp : null,
					status === "paid" ? actor.id : null,
					timestamp,
					id,
				),
		);
		await database.batch(statements);
		const updated = await readShare(database, id);
		if (!updated) return { kind: "not_found" };
		return {
			kind: "updated",
			removedProofObjectKey: status === "pending" ? (proof?.objectKey ?? null) : null,
			share: mapShare(updated),
		};
	});
}

export async function updateOpenShareAmount(
	id: string,
	shareAmountMinor: number,
	actor: ShareMutationActor,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<OpenShareAmountMutation, DbError>> {
	return safeDbCall(async () => {
		const existing = await readShare(database, id);
		if (!existing) return { kind: "not_found" };
		if (existing.expense_split_mode !== "open") return { kind: "not_open" };
		if (existing.participant_id === existing.expense_payer_id) return { kind: "payer_immutable" };
		if (!canMutateShare(existing, actor)) return { kind: "forbidden" };
		if (existing.status === "paid") return { kind: "paid_locked" };
		if (!Number.isSafeInteger(shareAmountMinor) || shareAmountMinor < 0) {
			throw new Error("Open share amounts must be non-negative safe integers.");
		}

		const shares = await readExpenseShares(database, existing.expense_id);
		const payerShares = shares.filter(
			(share) => share.participant_id === existing.expense_payer_id,
		);
		if (payerShares.length !== 1 || payerShares[0]?.status !== "settled") {
			throw new Error("Open expenses require exactly one settled payer share.");
		}
		const otherNonPayerTotal = shares.reduce(
			(sum, share) =>
				share.participant_id !== existing.expense_payer_id && share.id !== id
					? sum + share.share_amount_minor
					: sum,
			0,
		);
		if (shareAmountMinor > existing.expense_amount_minor - otherNonPayerTotal) {
			return { kind: "amount_exceeds_total" };
		}

		const timestamp = now.toISOString();
		await database.batch([
			database
				.prepare(
					`UPDATE expense_shares
					 SET share_amount_minor = ?, updated_at = ?
					 WHERE id = ? AND status = 'pending'
					   AND EXISTS (
					     SELECT 1 FROM expenses e
					     WHERE e.id = expense_shares.expense_id
					       AND e.deleted_at IS NULL AND e.split_mode = 'open'
					   )
					   AND ? <= (
					     SELECT e.amount_minor - COALESCE(SUM(other.share_amount_minor), 0)
					     FROM expenses e
					     LEFT JOIN expense_shares other
					       ON other.expense_id = e.id
					      AND other.participant_id != e.paid_by_participant_id
					      AND other.id != expense_shares.id
					     WHERE e.id = expense_shares.expense_id
					   )`,
				)
				.bind(shareAmountMinor, timestamp, id, shareAmountMinor),
			database
				.prepare(
					`UPDATE expense_shares
					 SET share_amount_minor = (
					       SELECT e.amount_minor - COALESCE(SUM(other.share_amount_minor), 0)
					       FROM expenses e
					       LEFT JOIN expense_shares other
					         ON other.expense_id = e.id
					        AND other.participant_id != e.paid_by_participant_id
					       WHERE e.id = expense_shares.expense_id
					     ),
					     updated_at = ?
					 WHERE expense_id = ? AND participant_id = ?`,
				)
				.bind(timestamp, existing.expense_id, existing.expense_payer_id),
			database
				.prepare("UPDATE expenses SET updated_at = ? WHERE id = ? AND deleted_at IS NULL")
				.bind(timestamp, existing.expense_id),
		]);

		const updated = await readShare(database, id);
		if (!updated) return { kind: "not_found" };
		if (updated.expense_split_mode !== "open") return { kind: "not_open" };
		if (updated.status === "paid") return { kind: "paid_locked" };
		if (updated.share_amount_minor !== shareAmountMinor) return { kind: "amount_exceeds_total" };
		return {
			kind: "updated",
			shares: (await readExpenseShares(database, existing.expense_id)).map(mapShare),
		};
	});
}

export async function attachSharePaymentProof(
	id: string,
	metadata: PaymentProofStorageMetadata,
	actor: ShareMutationActor,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<PaymentProofMutation, DbError>> {
	return safeDbCall(async () => {
		const existing = await readShare(database, id);
		const access = accessFor(existing, actor);
		if (access.kind !== "allowed") return access;
		if (!existing) throw new Error("Allowed share access requires an existing share.");
		const previousObjectKey = mapStoredProof(existing)?.objectKey ?? null;
		const timestamp = now.toISOString();
		await database.batch([
			database
				.prepare(
					`UPDATE expense_shares
					 SET status = 'paid',
					     paid_at = CASE WHEN status = 'paid' THEN paid_at ELSE ? END,
					     marked_by_user_id = CASE WHEN status = 'paid' THEN marked_by_user_id ELSE ? END,
					     bulk_payment_id = CASE WHEN status = 'paid' THEN bulk_payment_id ELSE NULL END,
					     updated_at = ?
					 WHERE id = ? AND status != 'settled'`,
				)
				.bind(timestamp, actor.id, timestamp, id),
			database
				.prepare(
					`INSERT INTO expense_share_payment_proofs
					 (share_id, object_key, filename, content_type, size_bytes,
					  uploaded_by_user_id, uploaded_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(share_id) DO UPDATE SET
					   object_key = excluded.object_key,
					   filename = excluded.filename,
					   content_type = excluded.content_type,
					   size_bytes = excluded.size_bytes,
					   uploaded_by_user_id = excluded.uploaded_by_user_id,
					   uploaded_at = excluded.uploaded_at`,
				)
				.bind(
					id,
					metadata.objectKey,
					metadata.filename,
					metadata.contentType,
					metadata.sizeBytes,
					actor.id,
					timestamp,
				),
		]);
		const updated = await readShare(database, id);
		if (!updated) return { kind: "not_found" };
		return { kind: "updated", previousObjectKey, share: mapShare(updated) };
	});
}
