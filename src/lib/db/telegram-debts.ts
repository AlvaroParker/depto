import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { TelegramDebtDirection } from "@/lib/telegram/conversation-contract";

interface TelegramDebtAggregateRow {
	total_amount_minor: number;
	total_expense_count: number;
}

interface TelegramDebtExpenseRow {
	expense_date: string;
	id: string;
	name: string;
	share_amount_minor: number;
}

export interface TelegramDebtBreakdownRecord {
	expenses: TelegramDebtExpenseRecord[];
	totalAmountMinor: number;
	totalExpenseCount: number;
}

export interface TelegramDebtExpenseRecord {
	expenseDate: string;
	id: string;
	name: string;
	shareAmountMinor: number;
}

export interface FindTelegramDebtBreakdownInput {
	callerParticipantId: string;
	counterpartyId: string;
	direction: TelegramDebtDirection;
	page: number;
	pageSize: number;
}

const TELEGRAM_DEBT_FILTER = `FROM expense_shares s
				 JOIN expenses e ON e.id = s.expense_id
				 WHERE e.deleted_at IS NULL
				   AND s.status = 'pending'
				   AND s.share_amount_minor > 0
				   AND s.participant_id = ?
				   AND s.paid_to_participant_id = ?`;

export async function findTelegramDebtBreakdown(
	input: FindTelegramDebtBreakdownInput,
	database: D1Database = getDatabase(),
): Promise<Result<TelegramDebtBreakdownRecord, DbError>> {
	return safeDbCall(async () => {
		const offset = (input.page - 1) * input.pageSize;
		if (!Number.isSafeInteger(offset)) throw new Error("Telegram debt page offset is unsafe.");
		const debtorId =
			input.direction === "due_to_caller" ? input.counterpartyId : input.callerParticipantId;
		const creditorId =
			input.direction === "due_to_caller" ? input.callerParticipantId : input.counterpartyId;
		const [aggregateResult, expensesResult] = await database.batch([
			database
				.prepare(
					`SELECT COALESCE(SUM(s.share_amount_minor), 0) AS total_amount_minor,
					        COUNT(*) AS total_expense_count
					 ${TELEGRAM_DEBT_FILTER}`,
				)
				.bind(debtorId, creditorId),
			database
				.prepare(
					`SELECT e.id, e.name, e.expense_date, s.share_amount_minor
					 ${TELEGRAM_DEBT_FILTER}
					 ORDER BY e.expense_date DESC, e.created_at DESC, e.id ASC
					 LIMIT ? OFFSET ?`,
				)
				.bind(debtorId, creditorId, input.pageSize, offset),
		]);
		const aggregate = aggregateResult.results[0] as unknown as TelegramDebtAggregateRow | undefined;
		if (
			!aggregate ||
			!Number.isSafeInteger(aggregate.total_amount_minor) ||
			aggregate.total_amount_minor < 0 ||
			!Number.isSafeInteger(aggregate.total_expense_count) ||
			aggregate.total_expense_count < 0
		) {
			throw new Error("Telegram debt aggregate is invalid.");
		}
		const expenses = (expensesResult.results as unknown as TelegramDebtExpenseRow[]).map(
			(row): TelegramDebtExpenseRecord => {
				if (!Number.isSafeInteger(row.share_amount_minor) || row.share_amount_minor <= 0) {
					throw new Error("Telegram debt share is invalid.");
				}
				return {
					expenseDate: row.expense_date,
					id: row.id,
					name: row.name,
					shareAmountMinor: row.share_amount_minor,
				};
			},
		);
		return {
			expenses,
			totalAmountMinor: aggregate.total_amount_minor,
			totalExpenseCount: aggregate.total_expense_count,
		};
	});
}
