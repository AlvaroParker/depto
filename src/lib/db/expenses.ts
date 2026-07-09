import "server-only";

import type { Result } from "ts-results";
import { PARTICIPANT_COUNT } from "@/lib/const/participants";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	ExpenseDetail,
	ExpenseInput,
	ExpensePage,
	ExpenseQuery,
	ExpenseShare,
	ExpenseSummary,
} from "@/lib/types/expense";
import type { Participant } from "@/lib/types/participant";
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
	name: string;
	payer_id: string;
	payer_name: string;
	payer_slug: string;
	payer_sort_order: number;
	receipt_content_type: string | null;
	receipt_filename: string | null;
	receipt_object_key: string | null;
	receipt_size_bytes: number | null;
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
	share_amount_minor: number;
	status: ExpenseShare["status"];
}

interface ParticipantRow {
	id: string;
	name: string;
	slug: string;
	sort_order: number;
}

const EXPENSE_SELECT = `
	SELECT e.id, e.name, e.description, e.amount_minor, e.currency, e.expense_date,
	       e.receipt_object_key, e.receipt_filename, e.receipt_content_type,
	       e.receipt_size_bytes, e.created_by_user_id, e.created_at, e.updated_at,
	       p.id AS payer_id, p.name AS payer_name, p.slug AS payer_slug,
	       p.sort_order AS payer_sort_order
	FROM expenses e
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
		name: row.name,
		payer: mapParticipant(row.payer_id, row.payer_name, row.payer_slug, row.payer_sort_order),
		shares,
	};
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
			        p.slug AS participant_slug, p.sort_order AS participant_sort_order
			 FROM expense_shares s
			 JOIN participants p ON p.id = s.participant_id
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

export async function createExpense(
	input: ExpenseInput,
	createdByUserId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ExpenseDetail, DbError>> {
	return safeDbCall(async () => {
		const participantResult = await database
			.prepare(
				`SELECT id, name, slug, sort_order
				 FROM participants
				 WHERE active = 1
				 ORDER BY sort_order ASC`,
			)
			.all<ParticipantRow>();
		const participants = participantResult.results;
		if (
			participants.length !== PARTICIPANT_COUNT ||
			!participants.some((participant) => participant.id === input.paidByParticipantId)
		) {
			throw new Error("Invalid participant configuration.");
		}
		const amounts = splitAmount(input.amountMinor, participants.length);
		const id = createId();
		const timestamp = now.toISOString();
		const statements: D1PreparedStatement[] = [
			database
				.prepare(
					`INSERT INTO expenses
					 (id, name, description, amount_minor, currency, expense_date,
					  paid_by_participant_id, created_by_user_id, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					id,
					input.name,
					input.description || null,
					input.amountMinor,
					input.currency,
					input.expenseDate,
					input.paidByParticipantId,
					createdByUserId,
					timestamp,
					timestamp,
				),
		];
		participants.forEach((participant, index) => {
			const isPayer = participant.id === input.paidByParticipantId;
			statements.push(
				database
					.prepare(
						`INSERT INTO expense_shares
						 (id, expense_id, participant_id, share_amount_minor, status,
						  paid_to_participant_id, paid_at, marked_by_user_id, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
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
		const expense = await findExpense(database, id);
		if (!expense) throw new Error("Created expense could not be read.");
		return expense;
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
	database: D1Database = getDatabase(),
): Promise<Result<ExpensePage, DbError>> {
	return safeDbCall(async () => {
		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 25;
		const where = ["e.deleted_at IS NULL"];
		const bindings: unknown[] = [];
		if (query.q) {
			where.push(
				"(lower(e.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(e.description, '')) LIKE ? ESCAPE '\\')",
			);
			const escaped = query.q
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
		if (query.pending !== undefined) {
			where.push(
				`${query.pending ? "" : "NOT "}EXISTS (
				 SELECT 1 FROM expense_shares pending_share
				 WHERE pending_share.expense_id = e.id AND pending_share.status = 'pending'
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
