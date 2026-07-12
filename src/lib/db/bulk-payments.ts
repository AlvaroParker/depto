import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { BulkPaymentResponse } from "@/lib/types/bulk-payment";
import type { Participant } from "@/lib/types/participant";
import type { PaymentProofStorageMetadata } from "@/lib/types/payment-proof";

interface BulkPaymentTargetRow {
	amount_paid_minor: number;
	id: string;
	name: string;
	paid_expense_count: number;
	slug: string;
	sort_order: number;
}

export interface BulkPaymentPreview {
	amountPaidMinor: number;
	paidExpenseCount: number;
	paidToParticipant: Participant;
}

export type BulkPaymentMutation =
	| { kind: "updated"; payment: BulkPaymentResponse }
	| { kind: "not_found" }
	| { kind: "self_target" }
	| { kind: "no_debt" };

function mapParticipant(row: BulkPaymentTargetRow): Participant {
	return { id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order };
}

export async function previewBulkPayment(
	participantId: string,
	paidToParticipantId: string,
	database: D1Database = getDatabase(),
): Promise<Result<BulkPaymentPreview | null, DbError>> {
	return safeDbCall(async () => {
		const row = await database
			.prepare(
				`SELECT p.id, p.name, p.slug, p.sort_order,
				        COUNT(s.id) AS paid_expense_count,
				        COALESCE(SUM(s.share_amount_minor), 0) AS amount_paid_minor
				 FROM participants p
				 LEFT JOIN expense_shares s
				   ON s.paid_to_participant_id = p.id
				  AND s.participant_id = ?
				  AND s.status = 'pending'
				  AND s.share_amount_minor > 0
				  AND EXISTS (
				    SELECT 1 FROM expenses e
				    WHERE e.id = s.expense_id AND e.deleted_at IS NULL
				  )
				 WHERE p.id = ?
				 GROUP BY p.id, p.name, p.slug, p.sort_order`,
			)
			.bind(participantId, paidToParticipantId)
			.first<BulkPaymentTargetRow>();
		if (!row) return null;
		return {
			amountPaidMinor: row.amount_paid_minor,
			paidExpenseCount: row.paid_expense_count,
			paidToParticipant: mapParticipant(row),
		};
	});
}

export async function payAllPendingShares(
	participantId: string,
	paidToParticipantId: string,
	actorUserId: string,
	operationId: string,
	proof: PaymentProofStorageMetadata | null,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<BulkPaymentMutation, DbError>> {
	return safeDbCall(async () => {
		if (participantId === paidToParticipantId) return { kind: "self_target" };
		const target = await database
			.prepare("SELECT id FROM participants WHERE id = ?")
			.bind(paidToParticipantId)
			.first<{ id: string }>();
		if (!target) return { kind: "not_found" };

		const paidAt = now.toISOString();
		const statements: D1PreparedStatement[] = [
			database
				.prepare(
					`UPDATE expense_shares
					 SET status = 'paid', paid_at = ?, marked_by_user_id = ?, updated_at = ?,
					     bulk_payment_id = ?
					 WHERE participant_id = ?
					   AND paid_to_participant_id = ?
					   AND status = 'pending'
					   AND share_amount_minor > 0
					   AND EXISTS (
					     SELECT 1 FROM expenses e
					     WHERE e.id = expense_shares.expense_id AND e.deleted_at IS NULL
					   )`,
				)
				.bind(paidAt, actorUserId, paidAt, operationId, participantId, paidToParticipantId),
		];
		if (proof) {
			statements.push(
				database
					.prepare(
						`INSERT INTO expense_share_payment_proofs
						 (share_id, object_key, filename, content_type, size_bytes,
						  uploaded_by_user_id, uploaded_at)
						 SELECT s.id, ?, ?, ?, ?, ?, ?
						 FROM expense_shares s
						 WHERE s.bulk_payment_id = ? AND s.status = 'paid'`,
					)
					.bind(
						proof.objectKey,
						proof.filename,
						proof.contentType,
						proof.sizeBytes,
						actorUserId,
						paidAt,
						operationId,
					),
			);
		}
		statements.push(
			database
				.prepare(
					`SELECT p.id, p.name, p.slug, p.sort_order,
					        COUNT(s.id) AS paid_expense_count,
					        COALESCE(SUM(s.share_amount_minor), 0) AS amount_paid_minor
					 FROM expense_shares s
					 JOIN participants p ON p.id = s.paid_to_participant_id
					 WHERE s.bulk_payment_id = ? AND s.status = 'paid'
					 GROUP BY p.id, p.name, p.slug, p.sort_order`,
				)
				.bind(operationId),
		);

		const results = await database.batch<BulkPaymentTargetRow>(statements);
		const summary = results.at(-1)?.results[0];
		if (!summary || summary.paid_expense_count === 0) return { kind: "no_debt" };
		return {
			kind: "updated",
			payment: {
				amountPaidMinor: summary.amount_paid_minor,
				paidAt,
				paidExpenseCount: summary.paid_expense_count,
				paidToParticipant: mapParticipant(summary),
				proofAttached: Boolean(proof),
			},
		};
	});
}
