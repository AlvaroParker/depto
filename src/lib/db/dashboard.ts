import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { listExpenses } from "@/lib/db/expenses";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	DashboardSummary,
	HouseholdDashboardSummary,
	ParticipantBalance,
	PendingTransfer,
	PersonalDebtByParticipant,
	PersonalDashboardSummary,
} from "@/lib/types/dashboard";
import type { Participant } from "@/lib/types/participant";

interface ParticipantRow {
	id: string;
	name: string;
	slug: string;
	sort_order: number;
}
interface TotalRow {
	expense_count: number;
	total_amount_minor: number;
}
interface GroupedRow {
	participant_id: string;
	amount_minor: number;
}
interface MatrixRow {
	from_id: string;
	to_id: string;
	amount_minor: number;
}
interface PersonalAggregateRow {
	amount_due_to_me_minor: number;
	amount_owed_minor: number;
	completed_received_minor: number;
	completed_sent_minor: number;
	due_to_me_expense_count: number;
	expected_spend_minor: number;
	owed_expense_count: number;
	paid_by_me_minor: number;
}
interface PersonalDebtRow extends ParticipantRow {
	amount_due_to_me_minor: number;
	amount_owed_minor: number;
	amount_due_to_me_expense_count: number;
	amount_owed_expense_count: number;
}

export interface DashboardContext {
	currentParticipantId?: string | null;
	database?: D1Database;
}

function mapParticipant(row: ParticipantRow): Participant {
	return { id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order };
}

async function getPersonalSummary(
	participantId: string,
	database: D1Database,
): Promise<PersonalDashboardSummary> {
	const [aggregate, debtResult, recentResult] = await Promise.all([
		database
			.prepare(
				`SELECT
				   COALESCE(SUM(CASE
				     WHEN s.participant_id = ? AND s.status = 'pending' AND s.share_amount_minor > 0 THEN s.share_amount_minor
				     ELSE 0 END), 0) AS amount_owed_minor,
				   COUNT(DISTINCT CASE
				     WHEN s.participant_id = ? AND s.status = 'pending' AND s.share_amount_minor > 0 THEN s.expense_id END
				   ) AS owed_expense_count,
				   COALESCE(SUM(CASE
				     WHEN s.paid_to_participant_id = ? AND s.status = 'pending' AND s.share_amount_minor > 0 THEN s.share_amount_minor
				     ELSE 0 END), 0) AS amount_due_to_me_minor,
				   COUNT(DISTINCT CASE
				     WHEN s.paid_to_participant_id = ? AND s.status = 'pending' AND s.share_amount_minor > 0 THEN s.expense_id END
				   ) AS due_to_me_expense_count,
				   COALESCE(SUM(CASE
				     WHEN s.participant_id = ? AND s.status = 'paid' THEN s.share_amount_minor
				     ELSE 0 END), 0) AS completed_sent_minor,
				   COALESCE(SUM(CASE
				     WHEN s.paid_to_participant_id = ? AND s.status = 'paid' THEN s.share_amount_minor
				     ELSE 0 END), 0) AS completed_received_minor,
				   COALESCE(SUM(CASE
				     WHEN s.participant_id = ? THEN s.share_amount_minor ELSE 0 END), 0
				   ) AS expected_spend_minor,
				   (SELECT COALESCE(SUM(paid_expense.amount_minor), 0)
				    FROM expenses paid_expense
				    WHERE paid_expense.deleted_at IS NULL
				      AND paid_expense.paid_by_participant_id = ?) AS paid_by_me_minor
				 FROM expense_shares s
				 JOIN expenses e ON e.id = s.expense_id
				 WHERE e.deleted_at IS NULL`,
			)
			.bind(
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
			)
			.first<PersonalAggregateRow>(),
		database
			.prepare(
				`SELECT p.id, p.name, p.slug, p.sort_order,
				        COALESCE(SUM(CASE WHEN s.participant_id = ? THEN s.share_amount_minor ELSE 0 END), 0)
				          AS amount_owed_minor,
				        COALESCE(SUM(CASE WHEN s.paid_to_participant_id = ? THEN s.share_amount_minor ELSE 0 END), 0)
				          AS amount_due_to_me_minor,
				        COUNT(DISTINCT CASE WHEN s.participant_id = ? THEN s.expense_id END)
				          AS amount_owed_expense_count,
				        COUNT(DISTINCT CASE WHEN s.paid_to_participant_id = ? THEN s.expense_id END)
				          AS amount_due_to_me_expense_count
				 FROM expense_shares s
				 JOIN expenses e ON e.id = s.expense_id AND e.deleted_at IS NULL
				 JOIN participants p ON p.id = CASE
				   WHEN s.participant_id = ? THEN s.paid_to_participant_id
				   ELSE s.participant_id
				 END
				 WHERE s.status = 'pending'
				   AND s.share_amount_minor > 0
				   AND (s.participant_id = ? OR s.paid_to_participant_id = ?)
				 GROUP BY p.id, p.name, p.slug, p.sort_order
				 ORDER BY amount_owed_minor + amount_due_to_me_minor DESC, p.sort_order ASC, p.id ASC`,
			)
			.bind(
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
				participantId,
			)
			.all<PersonalDebtRow>(),
		listExpenses({ page: 1, pageSize: 5 }, { database, participantScopeId: participantId }),
	]);
	if (recentResult.err) throw recentResult.val.cause;
	const values: PersonalAggregateRow = aggregate ?? {
		amount_due_to_me_minor: 0,
		amount_owed_minor: 0,
		completed_received_minor: 0,
		completed_sent_minor: 0,
		due_to_me_expense_count: 0,
		expected_spend_minor: 0,
		owed_expense_count: 0,
		paid_by_me_minor: 0,
	};
	return {
		amountDueToMeMinor: values.amount_due_to_me_minor,
		amountOwedMinor: values.amount_owed_minor,
		debtsByParticipant: debtResult.results.map((row): PersonalDebtByParticipant => ({
			amountDueToMeMinor: row.amount_due_to_me_minor,
			amountDueToMeExpenseCount: row.amount_due_to_me_expense_count,
			amountOwedMinor: row.amount_owed_minor,
			amountOwedExpenseCount: row.amount_owed_expense_count,
			participant: mapParticipant(row),
		})),
		dueToMeExpenseCount: values.due_to_me_expense_count,
		expectedSpendMinor: values.expected_spend_minor,
		owedExpenseCount: values.owed_expense_count,
		participantId,
		recentExpenses: recentResult.val.expenses,
		spentSoFarMinor:
			values.paid_by_me_minor - values.completed_received_minor + values.completed_sent_minor,
		view: "personal",
	};
}

async function getHouseholdSummary(database: D1Database): Promise<HouseholdDashboardSummary> {
	const [participantResult, total, paidResult, shareResult, matrixResult, recentResult] =
		await Promise.all([
			database
				.prepare(
					"SELECT id, name, slug, sort_order FROM participants WHERE active = 1 ORDER BY sort_order",
				)
				.all<ParticipantRow>(),
			database
				.prepare(
					"SELECT COUNT(*) AS expense_count, COALESCE(SUM(amount_minor), 0) AS total_amount_minor FROM expenses WHERE deleted_at IS NULL",
				)
				.first<TotalRow>(),
			database
				.prepare(
					"SELECT paid_by_participant_id AS participant_id, SUM(amount_minor) AS amount_minor FROM expenses WHERE deleted_at IS NULL GROUP BY paid_by_participant_id",
				)
				.all<GroupedRow>(),
			database
				.prepare(
					"SELECT s.participant_id, SUM(s.share_amount_minor) AS amount_minor FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.deleted_at IS NULL GROUP BY s.participant_id",
				)
				.all<GroupedRow>(),
			database
				.prepare(
					"SELECT s.participant_id AS from_id, s.paid_to_participant_id AS to_id, SUM(s.share_amount_minor) AS amount_minor FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.deleted_at IS NULL AND s.status = 'pending' AND s.share_amount_minor > 0 GROUP BY s.participant_id, s.paid_to_participant_id ORDER BY s.participant_id, s.paid_to_participant_id",
				)
				.all<MatrixRow>(),
			listExpenses({ page: 1, pageSize: 5 }, { database }),
		]);
	if (recentResult.err) throw recentResult.val.cause;
	const participants = participantResult.results.map(mapParticipant);
	const participantById = new Map(participants.map((participant) => [participant.id, participant]));
	const paid = new Map(paidResult.results.map((row) => [row.participant_id, row.amount_minor]));
	const shares = new Map(shareResult.results.map((row) => [row.participant_id, row.amount_minor]));
	const pendingIncoming = new Map<string, number>();
	const pendingOutgoing = new Map<string, number>();
	for (const row of matrixResult.results) {
		pendingIncoming.set(row.to_id, (pendingIncoming.get(row.to_id) ?? 0) + row.amount_minor);
		pendingOutgoing.set(row.from_id, (pendingOutgoing.get(row.from_id) ?? 0) + row.amount_minor);
	}
	const balances: ParticipantBalance[] = participants.map((participant) => {
		const totalPaidMinor = paid.get(participant.id) ?? 0;
		const totalShareMinor = shares.get(participant.id) ?? 0;
		return {
			participant,
			totalPaidMinor,
			totalShareMinor,
			netBalanceMinor:
				(pendingIncoming.get(participant.id) ?? 0) - (pendingOutgoing.get(participant.id) ?? 0),
		};
	});
	const pendingMatrix: PendingTransfer[] = matrixResult.results.flatMap((row) => {
		const from = participantById.get(row.from_id);
		const to = participantById.get(row.to_id);
		return from && to ? [{ amountMinor: row.amount_minor, from, to }] : [];
	});
	return {
		balances,
		expenseCount: total?.expense_count ?? 0,
		pendingMatrix,
		pendingTotalMinor: pendingMatrix.reduce((sum, transfer) => sum + transfer.amountMinor, 0),
		recentExpenses: recentResult.val.expenses,
		totalAmountMinor: total?.total_amount_minor ?? 0,
		view: "household",
	};
}

export async function getDashboardSummary(
	context: DashboardContext = {},
): Promise<Result<DashboardSummary, DbError>> {
	return safeDbCall<DashboardSummary>(() => {
		const database = context.database ?? getDatabase();
		return context.currentParticipantId
			? getPersonalSummary(context.currentParticipantId, database)
			: getHouseholdSummary(database);
	});
}
