import "server-only";
import { getDatabase } from "@/lib/db/bindings";
import { safeDbCall } from "@/lib/db/safe-db-call";

export function getExpenseReport(
	input: { dateFrom: string; dateTo: string; payer?: string; kind?: string },
	database: D1Database = getDatabase(),
) {
	return safeDbCall(async () => {
		const rows = await database
			.prepare(
				`SELECT e.kind_id AS kindId, k.name AS kindName,
			e.paid_by_participant_id AS payerId, p.name AS payerName,
			SUM(e.amount_minor) AS amountMinor, COUNT(*) AS expenseCount
			FROM expenses e JOIN expense_kinds k ON k.id = e.kind_id JOIN participants p ON p.id = e.paid_by_participant_id
			WHERE e.deleted_at IS NULL AND e.expense_date >= ? AND e.expense_date <= ?
			AND (? IS NULL OR e.paid_by_participant_id = ?) AND (? IS NULL OR e.kind_id = ?)
			GROUP BY e.kind_id, e.paid_by_participant_id ORDER BY amountMinor DESC, kindId, payerId`,
			)
			.bind(
				input.dateFrom,
				input.dateTo,
				input.payer ?? null,
				input.payer ?? null,
				input.kind ?? null,
				input.kind ?? null,
			)
			.all<{
				kindId: string;
				kindName: string;
				payerId: string;
				payerName: string;
				amountMinor: number;
				expenseCount: number;
			}>();
		const totalAmountMinor = rows.results.reduce((sum, row) => sum + row.amountMinor, 0);
		if (!Number.isSafeInteger(totalAmountMinor))
			throw new Error("Expense report exceeds safe integer range.");
		return {
			dateFrom: input.dateFrom,
			dateTo: input.dateTo,
			currency: "CLP" as const,
			groups: rows.results,
			totalAmountMinor,
			expenseCount: rows.results.reduce((sum, row) => sum + row.expenseCount, 0),
		};
	});
}
