import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import {
	type ExpenseIdempotencyInput,
	prepareCompletedExpenseIdempotencyRecord,
	readExpenseIdempotencyRecord,
} from "@/lib/db/expense-idempotency";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	ExpenseDetail,
	ExpenseCreateInput,
	ExpensePage,
	ExpensePatch,
	ExpenseQuery,
	ExpenseShare,
	ExpenseSummary,
	ExpenseSplitMode,
} from "@/lib/types/expense";
import type { UserRole } from "@/lib/const/roles";
import type { Participant } from "@/lib/types/participant";
import type { PaymentProofContentType } from "@/lib/const/payment-proofs";
import { createId } from "@/lib/util/ids";
import { splitAmount } from "@/lib/util/split-amount";

interface ExpenseRow {
	amount_minor: number;
	created_at: string;
	created_by_user_id: string;
	currency: string;
	description: string | null;
	expense_date: string;
	id: string;
	kind_icon_key: ExpenseSummary["kind"]["iconKey"];
	kind_id: string;
	kind_name: string;
	kind_sort_order: number;
	name: string;
	payer_id: string;
	payer_name: string;
	payer_slug: string;
	payer_sort_order: number;
	receipt_content_type: string | null;
	receipt_filename: string | null;
	receipt_object_key: string | null;
	receipt_size_bytes: number | null;
	split_mode: ExpenseSplitMode;
	updated_at: string;
}

interface ShareRow {
	expense_id: string;
	id: string;
	marked_by_user_id: string | null;
	paid_at: string | null;
	paid_to_participant_id: string | null;
	participant_id: string;
	participant_name: string;
	participant_slug: string;
	participant_sort_order: number;
	proof_content_type: PaymentProofContentType | null;
	proof_filename: string | null;
	proof_size_bytes: number | null;
	proof_uploaded_at: string | null;
	proof_uploaded_by_user_id: string | null;
	share_amount_minor: number;
	status: ExpenseShare["status"];
}

interface ParticipantRow {
	id: string;
	name: string;
	slug: string;
	sort_order: number;
}

export interface ExpenseListContext {
	currentParticipantId?: string | null;
	database?: D1Database;
	participantScopeId?: string | null;
}

async function findSelectedParticipants(
	database: D1Database,
	participantIds: string[],
	expenseId?: string,
): Promise<ParticipantRow[]> {
	const placeholders = participantIds.map(() => "?").join(", ");
	const availability = expenseId
		? `active = 1 OR EXISTS (
		     SELECT 1 FROM expense_shares
		     WHERE expense_id = ? AND participant_id = participants.id
		   )`
		: "active = 1";
	const bindings = expenseId ? [expenseId, ...participantIds] : participantIds;
	const result = await database
		.prepare(
			`SELECT id, name, slug, sort_order
			 FROM participants
			 WHERE (${availability}) AND id IN (${placeholders})
			 ORDER BY sort_order ASC`,
		)
		.bind(...bindings)
		.all<ParticipantRow>();
	if (result.results.length !== participantIds.length) {
		throw new Error("One or more selected participants are not available.");
	}
	return result.results;
}

const EXPENSE_SELECT = `
	SELECT e.id, e.name, e.description, e.amount_minor, e.currency, e.expense_date,
	       e.receipt_object_key, e.receipt_filename, e.receipt_content_type,
	       e.receipt_size_bytes, e.created_by_user_id, e.created_at, e.updated_at,
	       e.split_mode,
	       k.id AS kind_id, k.name AS kind_name, k.icon_key AS kind_icon_key,
	       k.sort_order AS kind_sort_order,
	       p.id AS payer_id, p.name AS payer_name, p.slug AS payer_slug,
	       p.sort_order AS payer_sort_order
	FROM expenses e
	JOIN expense_kinds k ON k.id = e.kind_id
	JOIN participants p ON p.id = e.paid_by_participant_id`;

function mapParticipant(id: string, name: string, slug: string, sortOrder: number): Participant {
	return { id, name, slug, sortOrder };
}

function mapShare(row: ShareRow): ExpenseShare {
	return {
		id: row.id,
		markedByUserId: row.marked_by_user_id,
		paidAt: row.paid_at,
		paidToParticipantId: row.paid_to_participant_id,
		participant: mapParticipant(
			row.participant_id,
			row.participant_name,
			row.participant_slug,
			row.participant_sort_order,
		),
		paymentProof:
			row.proof_filename &&
			row.proof_content_type &&
			row.proof_size_bytes &&
			row.proof_uploaded_at &&
			row.proof_uploaded_by_user_id
				? {
						contentType: row.proof_content_type,
						filename: row.proof_filename,
						sizeBytes: row.proof_size_bytes,
						uploadedAt: row.proof_uploaded_at,
						uploadedByUserId: row.proof_uploaded_by_user_id,
					}
				: null,
		shareAmountMinor: row.share_amount_minor,
		status: row.status,
	};
}

function mapSummary(row: ExpenseRow, shares: ExpenseShare[]): ExpenseSummary {
	return {
		amountMinor: row.amount_minor,
		currency: row.currency,
		description: row.description,
		expenseDate: row.expense_date,
		hasReceipt: Boolean(row.receipt_object_key),
		id: row.id,
		kind: {
			iconKey: row.kind_icon_key,
			id: row.kind_id,
			name: row.kind_name,
			sortOrder: row.kind_sort_order,
		},
		name: row.name,
		payer: mapParticipant(row.payer_id, row.payer_name, row.payer_slug, row.payer_sort_order),
		shares,
		splitMode: row.split_mode,
	};
}

function resolveShareAmounts(
	input: Pick<ExpenseCreateInput, "amountMinor" | "shareAllocations" | "splitMode">,
	participants: ParticipantRow[],
	splitMode: ExpenseSplitMode,
): number[] {
	if (splitMode === "equal") {
		if (input.shareAllocations?.length) {
			throw new Error("Equal splits cannot include manual allocations.");
		}
		return splitAmount(input.amountMinor, participants.length);
	}
	const allocations = input.shareAllocations ?? [];
	const allocationByParticipant = new Map(
		allocations.map((allocation) => [allocation.participantId, allocation.shareAmountMinor]),
	);
	if (
		allocations.length !== participants.length ||
		allocationByParticipant.size !== participants.length ||
		participants.some((participant) => !allocationByParticipant.has(participant.id))
	) {
		throw new Error("Manual splits require one allocation per selected participant.");
	}
	const amounts = participants.map(
		(participant) => allocationByParticipant.get(participant.id) ?? 0,
	);
	const total = amounts.reduce((sum, amount) => sum + amount, 0);
	if (
		amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
		!Number.isSafeInteger(total) ||
		total !== input.amountMinor
	) {
		throw new Error("Manual allocations must be non-negative safe integers with an exact total.");
	}
	return amounts;
}

function mapDetail(row: ExpenseRow, shares: ExpenseShare[]): ExpenseDetail {
	return {
		...mapSummary(row, shares),
		createdAt: row.created_at,
		createdByUserId: row.created_by_user_id,
		receiptContentType: row.receipt_content_type,
		receiptFilename: row.receipt_filename,
		receiptSizeBytes: row.receipt_size_bytes,
		updatedAt: row.updated_at,
	};
}

async function findShares(
	database: D1Database,
	expenseIds: string[],
): Promise<Map<string, ExpenseShare[]>> {
	const grouped = new Map<string, ExpenseShare[]>();
	if (expenseIds.length === 0) return grouped;
	const placeholders = expenseIds.map(() => "?").join(", ");
	const result = await database
		.prepare(
			`SELECT s.id, s.expense_id, s.share_amount_minor, s.status,
			        s.paid_to_participant_id, s.paid_at, s.marked_by_user_id,
			        p.id AS participant_id, p.name AS participant_name,
			        p.slug AS participant_slug, p.sort_order AS participant_sort_order,
			        proof.filename AS proof_filename, proof.content_type AS proof_content_type,
			        proof.size_bytes AS proof_size_bytes, proof.uploaded_at AS proof_uploaded_at,
			        proof.uploaded_by_user_id AS proof_uploaded_by_user_id
			 FROM expense_shares s
			 JOIN participants p ON p.id = s.participant_id
			 LEFT JOIN expense_share_payment_proofs proof ON proof.share_id = s.id
			 WHERE s.expense_id IN (${placeholders})
			 ORDER BY p.sort_order ASC`,
		)
		.bind(...expenseIds)
		.all<ShareRow>();
	for (const row of result.results) {
		const shares = grouped.get(row.expense_id) ?? [];
		shares.push(mapShare(row));
		grouped.set(row.expense_id, shares);
	}
	return grouped;
}

async function findExpense(database: D1Database, id: string): Promise<ExpenseDetail | null> {
	const row = await database
		.prepare(`${EXPENSE_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`)
		.bind(id)
		.first<ExpenseRow>();
	if (!row) return null;
	const shares = await findShares(database, [id]);
	return mapDetail(row, shares.get(id) ?? []);
}

interface PreparedExpenseCreation {
	expenseId: string;
	statements: D1PreparedStatement[];
}

async function prepareExpenseCreation(
	input: ExpenseCreateInput,
	createdByUserId: string,
	database: D1Database,
	now: Date,
): Promise<PreparedExpenseCreation> {
	const participants = await findSelectedParticipants(database, input.participantIds);
	if (!participants.some((participant) => participant.id === input.paidByParticipantId)) {
		throw new Error("The payer must be one of the selected participants.");
	}
	const initialPaidParticipantIds = input.initialPaidParticipantIds ?? [];
	const initialPaidParticipantIdSet = new Set(initialPaidParticipantIds);
	if (
		initialPaidParticipantIdSet.size !== initialPaidParticipantIds.length ||
		initialPaidParticipantIds.includes(input.paidByParticipantId) ||
		initialPaidParticipantIds.some((participantId) => !input.participantIds.includes(participantId))
	) {
		throw new Error("Initial paid participants must be unique selected non-payers.");
	}
	const splitMode = input.splitMode ?? "equal";
	const amounts = resolveShareAmounts(input, participants, splitMode);
	if (
		initialPaidParticipantIds.some(
			(participantId) =>
				amounts[participants.findIndex((participant) => participant.id === participantId)] === 0,
		)
	) {
		throw new Error("Zero-value shares cannot start paid.");
	}
	const expenseId = createId();
	const timestamp = now.toISOString();
	const statements: D1PreparedStatement[] = [
		database
			.prepare(
				`INSERT INTO expenses
				 (id, name, description, amount_minor, currency, expense_date, kind_id, split_mode,
				  paid_by_participant_id, created_by_user_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				expenseId,
				input.name,
				input.description || null,
				input.amountMinor,
				input.currency,
				input.expenseDate,
				input.kindId,
				splitMode,
				input.paidByParticipantId,
				createdByUserId,
				timestamp,
				timestamp,
			),
	];
	participants.forEach((participant, index) => {
		const isPayer = participant.id === input.paidByParticipantId;
		const isInitiallyPaid = initialPaidParticipantIdSet.has(participant.id);
		statements.push(
			database
				.prepare(
					`INSERT INTO expense_shares
					 (id, expense_id, participant_id, share_amount_minor, status,
					  paid_to_participant_id, paid_at, marked_by_user_id, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					createId(),
					expenseId,
					participant.id,
					amounts[index],
					isPayer ? "settled" : isInitiallyPaid ? "paid" : "pending",
					isPayer ? null : input.paidByParticipantId,
					isInitiallyPaid ? timestamp : null,
					isInitiallyPaid ? createdByUserId : null,
					timestamp,
					timestamp,
				),
		);
	});
	return { expenseId, statements };
}

export type IdempotentExpenseCreationOutcome =
	| { expense: ExpenseDetail; kind: "created" }
	| { expense: ExpenseDetail; kind: "replayed" }
	| { kind: "conflict" }
	| { kind: "in_progress" };

async function resolveExistingIdempotentExpense(
	database: D1Database,
	idempotency: ExpenseIdempotencyInput,
): Promise<Exclude<IdempotentExpenseCreationOutcome, { kind: "created" }> | null> {
	const existing = await readExpenseIdempotencyRecord(idempotency, database);
	if (!existing) return null;
	if (existing.requestHash !== idempotency.requestHash) return { kind: "conflict" };
	if (!existing.expenseId) return { kind: "in_progress" };
	const expense = await findExpense(database, existing.expenseId);
	if (!expense) throw new Error("Idempotent expense could not be read.");
	return { expense, kind: "replayed" };
}

export async function createExpense(
	input: ExpenseCreateInput,
	createdByUserId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ExpenseDetail, DbError>> {
	return safeDbCall(async () => {
		const prepared = await prepareExpenseCreation(input, createdByUserId, database, now);
		await database.batch(prepared.statements);
		const expense = await findExpense(database, prepared.expenseId);
		if (!expense) throw new Error("Created expense could not be read.");
		return expense;
	});
}

export async function createExpenseIdempotently(
	input: ExpenseCreateInput,
	createdByUserId: string,
	idempotency: ExpenseIdempotencyInput,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<IdempotentExpenseCreationOutcome, DbError>> {
	return safeDbCall(async () => {
		if (idempotency.userId !== createdByUserId) {
			throw new Error("The idempotency owner must be the expense creator.");
		}
		const existing = await resolveExistingIdempotentExpense(database, idempotency);
		if (existing) return existing;

		const prepared = await prepareExpenseCreation(input, createdByUserId, database, now);
		prepared.statements.push(
			prepareCompletedExpenseIdempotencyRecord(database, idempotency, prepared.expenseId, now),
		);
		try {
			await database.batch(prepared.statements);
		} catch (cause) {
			const raced = await resolveExistingIdempotentExpense(database, idempotency);
			if (raced) return raced;
			throw cause;
		}
		const expense = await findExpense(database, prepared.expenseId);
		if (!expense) throw new Error("Created expense could not be read.");
		return { expense, kind: "created" };
	});
}

export async function findExpenseById(
	id: string,
	database: D1Database = getDatabase(),
): Promise<Result<ExpenseDetail | null, DbError>> {
	return safeDbCall(() => findExpense(database, id));
}

export async function listExpenses(
	query: Partial<ExpenseQuery> = {},
	context: ExpenseListContext = {},
): Promise<Result<ExpensePage, DbError>> {
	return safeDbCall(async () => {
		const database = context.database ?? getDatabase();
		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 25;
		const where = ["e.deleted_at IS NULL"];
		const bindings: unknown[] = [];
		const search = query.q?.trim();
		if (search) {
			where.push(
				"(lower(e.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(e.description, '')) LIKE ? ESCAPE '\\')",
			);
			const escaped = search
				.toLocaleLowerCase("es")
				.replaceAll("\\", "\\\\")
				.replaceAll("%", "\\%")
				.replaceAll("_", "\\_");
			bindings.push(`%${escaped}%`, `%${escaped}%`);
		}
		if (query.payer) {
			where.push("e.paid_by_participant_id = ?");
			bindings.push(query.payer);
		}
		if (query.kind) {
			where.push("e.kind_id = ?");
			bindings.push(query.kind);
		}
		if (context.participantScopeId) {
			where.push(
				`EXISTS (
				 SELECT 1 FROM expense_shares scoped_share
				 WHERE scoped_share.expense_id = e.id
				   AND scoped_share.participant_id = ?
				)`,
			);
			bindings.push(context.participantScopeId);
		}
		if (query.pending === "mine") {
			if (!context.currentParticipantId) {
				throw new Error("The personal pending filter requires a participant identity.");
			}
			where.push(
				`EXISTS (
				 SELECT 1 FROM expense_shares personal_share
				 WHERE personal_share.expense_id = e.id
				   AND personal_share.participant_id = ?
				   AND personal_share.status = 'pending'
				   AND personal_share.share_amount_minor > 0
				   AND personal_share.paid_to_participant_id = e.paid_by_participant_id
				)`,
			);
			bindings.push(context.currentParticipantId);
		} else if (query.pending !== undefined) {
			where.push(
				`${query.pending ? "" : "NOT "}EXISTS (
				 SELECT 1 FROM expense_shares pending_share
				 WHERE pending_share.expense_id = e.id
				   AND pending_share.status = 'pending'
				   AND pending_share.share_amount_minor > 0
				)`,
			);
		}
		const whereSql = where.join(" AND ");
		const countRow = await database
			.prepare(`SELECT COUNT(*) AS total FROM expenses e WHERE ${whereSql}`)
			.bind(...bindings)
			.first<{ total: number }>();
		const result = await database
			.prepare(
				`${EXPENSE_SELECT}
				 WHERE ${whereSql}
				 ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
				 LIMIT ? OFFSET ?`,
			)
			.bind(...bindings, pageSize, (page - 1) * pageSize)
			.all<ExpenseRow>();
		const shares = await findShares(
			database,
			result.results.map((expense) => expense.id),
		);
		return {
			expenses: result.results.map((expense) => mapSummary(expense, shares.get(expense.id) ?? [])),
			page,
			pageSize,
			total: countRow?.total ?? 0,
		};
	});
}

export type ExpenseMutation =
	| { kind: "updated"; expense: ExpenseDetail; removedPaymentProofObjectKeys: string[] }
	| { kind: "not_found" }
	| { kind: "paid_reset_required" }
	| { kind: "forbidden" };

export interface ExpenseMutationActor {
	role: UserRole;
}

export async function updateExpense(
	id: string,
	input: ExpensePatch,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
	actor?: ExpenseMutationActor,
): Promise<Result<ExpenseMutation, DbError>> {
	return safeDbCall(async () => {
		const existing = await findExpense(database, id);
		if (!existing) return { kind: "not_found" };
		let removedPaymentProofObjectKeys: string[] = [];
		const currentParticipantIds = existing.shares.map((share) => share.participant.id).sort();
		const requestedParticipantIds = [...input.participantIds].sort();
		const requestedSplitMode = input.splitMode ?? existing.splitMode;
		const selectedParticipants = await findSelectedParticipants(database, input.participantIds, id);
		const requestedAmounts = resolveShareAmounts(input, selectedParticipants, requestedSplitMode);
		const requestedAmountByParticipant = new Map(
			selectedParticipants.map((participant, index) => [participant.id, requestedAmounts[index]]),
		);
		const financialChange =
			existing.amountMinor !== input.amountMinor ||
			existing.payer.id !== input.paidByParticipantId ||
			existing.splitMode !== requestedSplitMode ||
			currentParticipantIds.length !== requestedParticipantIds.length ||
			currentParticipantIds.some(
				(participantId, index) => participantId !== requestedParticipantIds[index],
			) ||
			existing.shares.some(
				(share) =>
					requestedAmountByParticipant.get(share.participant.id) !== share.shareAmountMinor,
			);
		if (financialChange) {
			if (existing.splitMode === "open" && actor?.role !== "root" && actor?.role !== "admin") {
				return { kind: "forbidden" };
			}
			const hasPaid = existing.shares.some((share) => share.status === "paid");
			if (hasPaid && !input.resetPaidReimbursements) return { kind: "paid_reset_required" };
			const proofKeys = await database
				.prepare(
					`SELECT proof.object_key
					 FROM expense_share_payment_proofs proof
					 JOIN expense_shares share ON share.id = proof.share_id
					 WHERE share.expense_id = ?`,
				)
				.bind(id)
				.all<{ object_key: string }>();
			removedPaymentProofObjectKeys = proofKeys.results.map((proof) => proof.object_key);
			const participants = selectedParticipants;
			if (!participants.some((participant) => participant.id === input.paidByParticipantId)) {
				throw new Error("The payer must be one of the selected participants.");
			}
			const timestamp = now.toISOString();
			const amounts = requestedAmounts;
			const statements: D1PreparedStatement[] = [
				database
					.prepare(
						"UPDATE expenses SET name = ?, description = ?, amount_minor = ?, currency = ?, expense_date = ?, kind_id = ?, split_mode = ?, paid_by_participant_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
					)
					.bind(
						input.name,
						input.description || null,
						input.amountMinor,
						input.currency,
						input.expenseDate,
						input.kindId,
						requestedSplitMode,
						input.paidByParticipantId,
						timestamp,
						id,
					),
				database.prepare("DELETE FROM expense_shares WHERE expense_id = ?").bind(id),
			];
			participants.forEach((participant, index) => {
				const isPayer = participant.id === input.paidByParticipantId;
				statements.push(
					database
						.prepare(
							"INSERT INTO expense_shares (id, expense_id, participant_id, share_amount_minor, status, paid_to_participant_id, paid_at, marked_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)",
						)
						.bind(
							createId(),
							id,
							participant.id,
							amounts[index],
							isPayer ? "settled" : "pending",
							isPayer ? null : input.paidByParticipantId,
							timestamp,
							timestamp,
						),
				);
			});
			await database.batch(statements);
		} else {
			await database
				.prepare(
					"UPDATE expenses SET name = ?, description = ?, currency = ?, expense_date = ?, kind_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
				)
				.bind(
					input.name,
					input.description || null,
					input.currency,
					input.expenseDate,
					input.kindId,
					now.toISOString(),
					id,
				)
				.run();
		}
		const updated = await findExpense(database, id);
		if (!updated) return { kind: "not_found" };
		return { expense: updated, kind: "updated", removedPaymentProofObjectKeys };
	});
}

export async function softDeleteExpense(
	id: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<boolean, DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				"UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
			)
			.bind(now.toISOString(), now.toISOString(), id)
			.run();
		return result.meta.changes === 1;
	});
}
