import "server-only";

import { Err, Ok, type Result } from "ts-results";
import {
	payAllPendingShares,
	previewBulkPayment,
	type BulkPaymentMutation,
} from "@/lib/db/bulk-payments";
import { getBindings } from "@/lib/db/bindings";
import type { UserRole } from "@/lib/const/roles";
import type { PaymentProofContentType } from "@/lib/const/payment-proofs";
import { createBulkPaymentProofObjectKey } from "@/lib/util/payment-proofs";
import { createId } from "@/lib/util/ids";

export interface BulkPaymentActor {
	participantId: string;
	role: UserRole;
	userId: string;
}

export interface BulkPaymentProofFile {
	bytes: Uint8Array;
	contentType: PaymentProofContentType;
	filename: string;
}

export type BulkPaymentServiceError = { kind: "database_error" } | { kind: "storage_error" };

async function removeUploadedObject(objectKey: string): Promise<void> {
	try {
		await getBindings().RECEIPTS.delete(objectKey);
	} catch {
		// Compensating cleanup is best effort after an uncommitted financial mutation.
	}
}

export async function payAllActorDebt(
	paidToParticipantId: string,
	proofFile: BulkPaymentProofFile | null,
	actor: BulkPaymentActor,
): Promise<Result<BulkPaymentMutation, BulkPaymentServiceError>> {
	if (actor.participantId === paidToParticipantId) return Ok({ kind: "self_target" });
	const preview = await previewBulkPayment(actor.participantId, paidToParticipantId);
	if (preview.err) return Err({ kind: "database_error" });
	if (!preview.val) return Ok({ kind: "not_found" });
	if (preview.val.paidExpenseCount === 0) return Ok({ kind: "no_debt" });

	let objectKey: string | null = null;
	if (proofFile) {
		objectKey = createBulkPaymentProofObjectKey(proofFile.contentType);
		try {
			await getBindings().RECEIPTS.put(objectKey, proofFile.bytes, {
				httpMetadata: { contentType: proofFile.contentType },
			});
		} catch {
			await removeUploadedObject(objectKey);
			return Err({ kind: "storage_error" });
		}
	}

	const result = await payAllPendingShares(
		actor.participantId,
		paidToParticipantId,
		actor.userId,
		createId(),
		proofFile && objectKey
			? {
					contentType: proofFile.contentType,
					filename: proofFile.filename,
					objectKey,
					sizeBytes: proofFile.bytes.byteLength,
				}
			: null,
	);
	if (result.err) {
		if (objectKey) await removeUploadedObject(objectKey);
		return Err({ kind: "database_error" });
	}
	if (result.val.kind !== "updated" && objectKey) await removeUploadedObject(objectKey);
	return Ok(result.val);
}
