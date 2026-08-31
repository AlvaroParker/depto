import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { ReceiptMetadata } from "@/lib/types/receipt";

interface ReceiptRow {
	receipt_content_type: ReceiptMetadata["contentType"] | null;
	receipt_filename: string | null;
	receipt_object_key: string | null;
	receipt_size_bytes: number | null;
}

function mapReceipt(row: ReceiptRow | null): ReceiptMetadata | null {
	if (
		!row?.receipt_object_key ||
		!row.receipt_filename ||
		!row.receipt_content_type ||
		!row.receipt_size_bytes
	)
		return null;
	return {
		contentType: row.receipt_content_type,
		filename: row.receipt_filename,
		objectKey: row.receipt_object_key,
		sizeBytes: row.receipt_size_bytes,
	};
}

export async function findExpenseReceipt(
	expenseId: string,
	database: D1Database = getDatabase(),
): Promise<Result<ReceiptMetadata | null, DbError>> {
	return safeDbCall(async () =>
		mapReceipt(
			await database
				.prepare(
					"SELECT receipt_object_key, receipt_filename, receipt_content_type, receipt_size_bytes FROM expenses WHERE id = ? AND deleted_at IS NULL",
				)
				.bind(expenseId)
				.first<ReceiptRow>(),
		),
	);
}

export interface ReceiptAttachment {
	attached: boolean;
	previousObjectKey: string | null;
}

export type ReceiptAttachmentIfMissing =
	| { kind: "already_attached"; receipt: ReceiptMetadata }
	| { kind: "attached" }
	| { kind: "not_found" };

export async function attachExpenseReceiptIfMissing(
	expenseId: string,
	receipt: ReceiptMetadata,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ReceiptAttachmentIfMissing, DbError>> {
	return safeDbCall(async () => {
		const existingRow = await database
			.prepare(
				"SELECT receipt_object_key, receipt_filename, receipt_content_type, receipt_size_bytes FROM expenses WHERE id = ? AND deleted_at IS NULL",
			)
			.bind(expenseId)
			.first<ReceiptRow>();
		if (!existingRow) return { kind: "not_found" };
		const existing = mapReceipt(existingRow);
		if (existing) return { kind: "already_attached", receipt: existing };

		const update = await database
			.prepare(
				`UPDATE expenses
				 SET receipt_object_key = ?, receipt_filename = ?, receipt_content_type = ?,
				     receipt_size_bytes = ?, updated_at = ?
				 WHERE id = ? AND deleted_at IS NULL AND receipt_object_key IS NULL`,
			)
			.bind(
				receipt.objectKey,
				receipt.filename,
				receipt.contentType,
				receipt.sizeBytes,
				now.toISOString(),
				expenseId,
			)
			.run();
		if (update.meta.changes === 1) return { kind: "attached" };

		const racedRow = await database
			.prepare(
				"SELECT receipt_object_key, receipt_filename, receipt_content_type, receipt_size_bytes FROM expenses WHERE id = ? AND deleted_at IS NULL",
			)
			.bind(expenseId)
			.first<ReceiptRow>();
		if (!racedRow) return { kind: "not_found" };
		const raced = mapReceipt(racedRow);
		if (!raced) throw new Error("Receipt attachment did not persist.");
		return { kind: "already_attached", receipt: raced };
	});
}

export async function attachExpenseReceipt(
	expenseId: string,
	receipt: ReceiptMetadata,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ReceiptAttachment, DbError>> {
	return safeDbCall(async () => {
		const previous = await database
			.prepare(
				"SELECT receipt_object_key, receipt_filename, receipt_content_type, receipt_size_bytes FROM expenses WHERE id = ? AND deleted_at IS NULL",
			)
			.bind(expenseId)
			.first<ReceiptRow>();
		if (!previous) return { attached: false, previousObjectKey: null };
		const update = await database
			.prepare(
				"UPDATE expenses SET receipt_object_key = ?, receipt_filename = ?, receipt_content_type = ?, receipt_size_bytes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
			)
			.bind(
				receipt.objectKey,
				receipt.filename,
				receipt.contentType,
				receipt.sizeBytes,
				now.toISOString(),
				expenseId,
			)
			.run();
		return { attached: update.meta.changes === 1, previousObjectKey: previous.receipt_object_key };
	});
}

export async function detachExpenseReceipt(
	expenseId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<{ found: boolean; objectKey: string | null }, DbError>> {
	return safeDbCall(async () => {
		const existing = await database
			.prepare("SELECT receipt_object_key FROM expenses WHERE id = ? AND deleted_at IS NULL")
			.bind(expenseId)
			.first<{ receipt_object_key: string | null }>();
		if (!existing) return { found: false, objectKey: null };
		await database
			.prepare(
				`UPDATE expenses SET receipt_object_key = NULL, receipt_filename = NULL,
				 receipt_content_type = NULL, receipt_size_bytes = NULL, updated_at = ?
				 WHERE id = ? AND deleted_at IS NULL`,
			)
			.bind(now.toISOString(), expenseId)
			.run();
		return { found: true, objectKey: existing.receipt_object_key };
	});
}
