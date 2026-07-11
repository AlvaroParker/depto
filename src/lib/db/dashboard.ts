import "server-only";

import type { Result } from "ts-results";
import { getDatabase } from "@/lib/db/bindings";
import { listExpenses } from "@/lib/db/expenses";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type { DashboardSummary, ParticipantBalance, PendingTransfer } from "@/lib/types/dashboard";
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

function mapParticipant(row: ParticipantRow): Participant {
	return { id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order };
}

export async function getDashboardSummary(
	database: D1Database = getDatabase(),
): Promise<Result<DashboardSummary, DbError>> {
	return safeDbCall(async () => {
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
						"SELECT s.participant_id AS from_id, s.paid_to_participant_id AS to_id, SUM(s.share_amount_minor) AS amount_minor FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.deleted_at IS NULL AND s.status = 'pending' GROUP BY s.participant_id, s.paid_to_participant_id ORDER BY s.participant_id, s.paid_to_participant_id",
					)
					.all<MatrixRow>(),
				listExpenses({ page: 1, pageSize: 5 }, { database }),
			]);
		if (recentResult.err) throw recentResult.val.cause;
		const participants = participantResult.results.map(mapParticipant);
		const participantById = new Map(
			participants.map((participant) => [participant.id, participant]),
		);
		const paid = new Map(paidResult.results.map((row) => [row.participant_id, row.amount_minor]));
		const shares = new Map(
			shareResult.results.map((row) => [row.participant_id, row.amount_minor]),
		);
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
		};
	});
}
