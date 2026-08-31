import "server-only";

import {
	attachExpenseReceipt,
	attachExpenseReceiptIfMissing,
	findExpenseReceipt,
} from "@/lib/db/receipts";
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
import {
	createReceiptObjectKey,
	type ReceiptImageContentType,
	validateReceiptImageSignature,
	validateReceiptMetadata,
} from "@/lib/util/receipts";

export interface ReceiptStorageDependencies {
	database: D1Database;
	receipts: R2Bucket;
}

export type ReceiptStreamAttachmentOutcome =
	{ kind: "already_attached" } | { kind: "attached" } | { kind: "failed" } | { kind: "not_found" };

async function readExactReceiptBytes(stream: unknown, expectedSize: number): Promise<Uint8Array> {
	if (!stream || typeof (stream as ReadableStream).getReader !== "function") {
		throw new Error("The receipt stream is not readable.");
	}
	const reader = (stream as ReadableStream<unknown>).getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!(value instanceof Uint8Array)) throw new Error("The receipt stream must contain bytes.");
			size += value.byteLength;
			if (size > expectedSize) throw new Error("The receipt is larger than declared.");
			chunks.push(value);
		}
		if (size !== expectedSize) throw new Error("The receipt size does not match its metadata.");
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function attachReceiptStreamIfMissing(
	expenseId: string,
	input: { contentType: string; filename: string; sizeBytes: number },
	stream: unknown,
	dependencies: ReceiptStorageDependencies,
): Promise<ReceiptStreamAttachmentOutcome> {
	const metadata = validateReceiptMetadata(input);
	const existing = await findExpenseReceipt(expenseId, dependencies.database);
	if (existing.err) return { kind: "failed" };
	if (existing.val) {
		await (stream as ReadableStream | undefined)?.cancel?.().catch(() => undefined);
		return { kind: "already_attached" };
	}
	const objectKey = createReceiptObjectKey(expenseId, metadata.contentType);
	try {
		const bytes = await readExactReceiptBytes(stream, metadata.sizeBytes);
		validateReceiptImageSignature(bytes, metadata.contentType as ReceiptImageContentType);
		await dependencies.receipts.put(objectKey, bytes, {
			httpMetadata: { contentType: metadata.contentType },
		});
		const result = await attachExpenseReceiptIfMissing(
			expenseId,
			{ ...metadata, objectKey },
			dependencies.database,
		);
		if (result.err || result.val.kind === "not_found") {
			await dependencies.receipts.delete(objectKey);
			return result.err ? { kind: "failed" } : { kind: "not_found" };
		}
		if (result.val.kind === "already_attached") {
			await dependencies.receipts.delete(objectKey);
			return { kind: "already_attached" };
		}
		return { kind: "attached" };
	} catch {
		await dependencies.receipts.delete(objectKey).catch(() => undefined);
		return { kind: "failed" };
	}
}

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
