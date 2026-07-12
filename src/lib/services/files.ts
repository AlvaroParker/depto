import "server-only";

import { attachExpenseReceipt } from "@/lib/db/receipts";
import {
	attachSharePaymentProof,
	countPaymentProofObjectReferences,
	findShareByExpenseAndParticipant,
} from "@/lib/db/expense-shares";
import { getBindings } from "@/lib/db/bindings";
import type { AcquiredMcpFile } from "@/lib/mcp/files";
import type { OAuthActor } from "@/lib/types/actor";
import type { UserRole } from "@/lib/const/roles";
import { createPaymentProofObjectKey } from "@/lib/util/payment-proofs";
import { createReceiptObjectKey } from "@/lib/util/receipts";

export async function attachMcpReceipt(expenseId: string, file: AcquiredMcpFile) {
	const bindings = getBindings();
	const contentType = file.contentType as
		"image/jpeg" | "image/png" | "image/webp" | "application/pdf";
	const objectKey = createReceiptObjectKey(expenseId, contentType);
	try {
		await bindings.RECEIPTS.put(objectKey, file.bytes, {
			httpMetadata: { contentType: file.contentType },
		});
		const result = await attachExpenseReceipt(expenseId, {
			contentType,
			filename: file.filename,
			objectKey,
			sizeBytes: file.bytes.byteLength,
		});
		if (result.err || !result.val.attached) {
			await bindings.RECEIPTS.delete(objectKey);
			return false;
		}
		if (result.val.previousObjectKey) await bindings.RECEIPTS.delete(result.val.previousObjectKey);
		return true;
	} catch {
		await bindings.RECEIPTS.delete(objectKey).catch(() => undefined);
		return false;
	}
}

export async function deletePaymentProofObjectIfUnreferenced(objectKey: string): Promise<void> {
	const references = await countPaymentProofObjectReferences(objectKey);
	if (references.err || references.val > 0) return;
	try {
		await getBindings().RECEIPTS.delete(objectKey);
	} catch {
		// The database association is authoritative; object cleanup is best effort.
	}
}

export async function deletePaymentProofObjectsIfUnreferenced(objectKeys: string[]): Promise<void> {
	await Promise.all([...new Set(objectKeys)].map(deletePaymentProofObjectIfUnreferenced));
}

export async function attachActorPaymentProof(
	expenseId: string,
	file: AcquiredMcpFile,
	actor: OAuthActor,
) {
	const share = await findShareByExpenseAndParticipant(expenseId, actor.participantId);
	if (share.err || !share.val) return null;
	return attachPaymentProofToShare(share.val.id, file, actor);
}

export async function attachPaymentProofToShare(
	shareId: string,
	file: AcquiredMcpFile,
	actor: { participantId: string | null; role: UserRole; userId: string },
) {
	const bindings = getBindings();
	const contentType = file.contentType as "image/jpeg" | "image/png" | "image/webp";
	const objectKey = createPaymentProofObjectKey(shareId, contentType);
	try {
		await bindings.RECEIPTS.put(objectKey, file.bytes, {
			httpMetadata: { contentType: file.contentType },
		});
		const result = await attachSharePaymentProof(
			shareId,
			{
				contentType,
				filename: file.filename,
				objectKey,
				sizeBytes: file.bytes.byteLength,
			},
			{ id: actor.userId, participantId: actor.participantId, role: actor.role },
		);
		if (result.err || result.val.kind !== "updated") {
			await bindings.RECEIPTS.delete(objectKey);
			return null;
		}
		if (result.val.previousObjectKey) {
			await deletePaymentProofObjectIfUnreferenced(result.val.previousObjectKey);
		}
		return result.val.share;
	} catch {
		await bindings.RECEIPTS.delete(objectKey).catch(() => undefined);
		return null;
	}
}
