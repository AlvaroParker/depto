import "server-only";
import { getDatabase } from "./bindings";
import { safeDbCall } from "./safe-db-call";
import type {
	ExpenseComparison,
	ExpenseComparisonInput,
	ExpenseTrends,
	ExpenseTrendsInput,
	MySpending,
	MySpendingInput,
} from "@/lib/types/spending-insights";
import {
	calendarMonthBounds,
	calendarMonthIndex,
	checkedTotal,
	describeSpendingPeriod,
	spendingChange,
} from "@/lib/util/spending-insights";

interface CategoryTotal {
	kindId: string;
	kindName: string;
	amountMinor: number;
	expenseCount: number;
}

function householdQuery(database: D1Database, input: ExpenseTrendsInput, monthly = false) {
	return database
		.prepare(
			`SELECT ${monthly ? "substr(e.expense_date, 1, 7) AS month," : ""}
			 e.kind_id AS kindId, k.name AS kindName,
			 SUM(e.amount_minor) AS amountMinor, COUNT(*) AS expenseCount
			 FROM expenses e JOIN expense_kinds k ON k.id = e.kind_id
			 WHERE e.deleted_at IS NULL AND e.expense_date >= ? AND e.expense_date <= ?
			 AND (? IS NULL OR e.kind_id = ?) AND (? IS NULL OR e.paid_by_participant_id = ?)
			 GROUP BY ${monthly ? "substr(e.expense_date, 1, 7)," : ""} e.kind_id
			 ORDER BY ${monthly ? "month," : ""} amountMinor DESC, kindId`,
		)
		.bind(
			input.dateFrom,
			input.dateTo,
			input.kind ?? null,
			input.kind ?? null,
			input.payer ?? null,
			input.payer ?? null,
		);
}

function totals(rows: CategoryTotal[]) {
	return {
		totalAmountMinor: checkedTotal(rows.map((row) => row.amountMinor)),
		expenseCount: checkedTotal(rows.map((row) => row.expenseCount)),
	};
}

export function getExpenseComparison(
	input: ExpenseComparisonInput,
	database: D1Database = getDatabase(),
) {
	return safeDbCall<ExpenseComparison>(async () => {
		const [current, previous] = await database.batch<CategoryTotal>([
			householdQuery(database, { ...input.period, kind: input.kind, payer: input.payer }),
			householdQuery(database, { ...input.baseline, kind: input.kind, payer: input.payer }),
		]);
		const period = { ...describeSpendingPeriod(input.period), ...totals(current.results) };
		const baseline = { ...describeSpendingPeriod(input.baseline), ...totals(previous.results) };
		const currentByKind = new Map(current.results.map((row) => [row.kindId, row]));
		const previousByKind = new Map(previous.results.map((row) => [row.kindId, row]));
		const categories = [...new Set([...currentByKind.keys(), ...previousByKind.keys()])].map(
			(kindId) => {
				const currentRow = currentByKind.get(kindId);
				const previousRow = previousByKind.get(kindId);
				const periodAmountMinor = currentRow?.amountMinor ?? 0;
				const baselineAmountMinor = previousRow?.amountMinor ?? 0;
				return {
					kindId,
					kindName: (currentRow ?? previousRow)!.kindName,
					periodAmountMinor,
					baselineAmountMinor,
					change: spendingChange(periodAmountMinor, baselineAmountMinor),
				};
			},
		);
		categories.sort(
			(a, b) =>
				Math.abs(b.change.amountMinor) - Math.abs(a.change.amountMinor) ||
				a.kindId.localeCompare(b.kindId),
		);
		return {
			currency: "CLP",
			filters: { kind: input.kind ?? null, payer: input.payer ?? null },
			period,
			baseline,
			sameDayCount: period.dayCount === baseline.dayCount,
			change: spendingChange(period.totalAmountMinor, baseline.totalAmountMinor),
			categories,
		};
	});
}

export function getExpenseTrends(input: ExpenseTrendsInput, database: D1Database = getDatabase()) {
	return safeDbCall<ExpenseTrends>(async () => {
		const { results } = await householdQuery(database, input, true).all<
			CategoryTotal & { month: string }
		>();
		const categoriesByMonth = new Map<string, CategoryTotal[]>();
		for (const { month, ...category } of results) {
			const categories = categoriesByMonth.get(month) ?? [];
			categories.push(category);
			categoriesByMonth.set(month, categories);
		}
		const months: ExpenseTrends["months"] = [];
		for (
			let index = calendarMonthIndex(input.dateFrom);
			index <= calendarMonthIndex(input.dateTo);
			index++
		) {
			const bounds = calendarMonthBounds(index);
			const month = bounds.dateFrom.slice(0, 7);
			const categories = categoriesByMonth.get(month) ?? [];
			months.push({
				month,
				...describeSpendingPeriod({
					dateFrom: bounds.dateFrom < input.dateFrom ? input.dateFrom : bounds.dateFrom,
					dateTo: bounds.dateTo > input.dateTo ? input.dateTo : bounds.dateTo,
				}),
				...totals(categories),
				categories,
			});
		}
		return {
			...describeSpendingPeriod({ dateFrom: input.dateFrom, dateTo: input.dateTo }),
			...totals(results),
			currency: "CLP",
			filters: { kind: input.kind ?? null, payer: input.payer ?? null },
			months,
		};
	});
}

export function getMySpendingReport(
	input: MySpendingInput,
	participantId: string,
	database: D1Database = getDatabase(),
) {
	return safeDbCall<MySpending>(async () => {
		// Aggregate incoming shares before joining expenses: upfront amounts must
		// be counted once even when an expense has several reimbursement recipients.
		const { results: categories } = await database
			.prepare(
				`SELECT e.kind_id AS kindId, k.name AS kindName, COUNT(*) AS expenseCount,
				 SUM(COALESCE(own.share_amount_minor, 0)) AS allocatedAmountMinor,
				 SUM(CASE WHEN e.paid_by_participant_id = ? THEN e.amount_minor ELSE 0 END) AS paidUpfrontAmountMinor,
				 SUM(CASE WHEN own.status = 'paid' THEN own.share_amount_minor ELSE 0 END) AS reimbursedAmountMinor,
				 SUM(CASE WHEN own.status = 'pending' THEN own.share_amount_minor ELSE 0 END) AS pendingToPayAmountMinor,
				 SUM(COALESCE(incoming.received, 0)) AS receivedReimbursementsAmountMinor,
				 SUM(COALESCE(incoming.pending, 0)) AS pendingToReceiveAmountMinor
				 FROM expenses e JOIN expense_kinds k ON k.id = e.kind_id
				 LEFT JOIN expense_shares own ON own.expense_id = e.id AND own.participant_id = ?
				 LEFT JOIN (
				   SELECT expense_id,
				     SUM(CASE WHEN status = 'paid' THEN share_amount_minor ELSE 0 END) AS received,
				     SUM(CASE WHEN status = 'pending' THEN share_amount_minor ELSE 0 END) AS pending
				   FROM expense_shares WHERE paid_to_participant_id = ? GROUP BY expense_id
				 ) incoming ON incoming.expense_id = e.id
				 WHERE e.deleted_at IS NULL AND e.expense_date >= ? AND e.expense_date <= ?
				 AND (? IS NULL OR e.kind_id = ?)
				 AND (e.paid_by_participant_id = ? OR own.id IS NOT NULL)
				 GROUP BY e.kind_id ORDER BY allocatedAmountMinor DESC, kindId`,
			)
			.bind(
				participantId,
				participantId,
				participantId,
				input.dateFrom,
				input.dateTo,
				input.kind ?? null,
				input.kind ?? null,
				participantId,
			)
			.all<MySpending["categories"][number]>();
		return {
			...describeSpendingPeriod({ dateFrom: input.dateFrom, dateTo: input.dateTo }),
			currency: "CLP",
			participantId,
			filters: { kind: input.kind ?? null },
			dateBasis: "expense_date",
			reimbursementBasis: "current_status",
			allocatedAmountMinor: checkedTotal(categories.map((row) => row.allocatedAmountMinor)),
			paidUpfrontAmountMinor: checkedTotal(categories.map((row) => row.paidUpfrontAmountMinor)),
			reimbursedAmountMinor: checkedTotal(categories.map((row) => row.reimbursedAmountMinor)),
			receivedReimbursementsAmountMinor: checkedTotal(
				categories.map((row) => row.receivedReimbursementsAmountMinor),
			),
			pendingToPayAmountMinor: checkedTotal(categories.map((row) => row.pendingToPayAmountMinor)),
			pendingToReceiveAmountMinor: checkedTotal(
				categories.map((row) => row.pendingToReceiveAmountMinor),
			),
			expenseCount: checkedTotal(categories.map((row) => row.expenseCount)),
			categories,
		};
	});
}
