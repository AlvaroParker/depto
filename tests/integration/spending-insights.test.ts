import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense, softDeleteExpense } from "@/lib/db/expenses";
import {
	getExpenseComparison,
	getExpenseTrends,
	getMySpendingReport,
} from "@/lib/db/spending-insights";
import {
	ExpenseComparisonSchema,
	ExpenseTrendsSchema,
	MySpendingSchema,
} from "@/lib/types/spending-insights";
import type { ExpenseCreateInput } from "@/lib/types/expense";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const alvaro = "participant_alvaro";
const camila = "participant_camila";
const trinidad = "participant_trinidad";
const september = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };
const august = { dateFrom: "2026-08-01", dateTo: "2026-08-31" };

describe("spending insight database reports", () => {
	let bindings: TestBindings;
	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				`INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES ('report-user', 'report-user', 'hash', 'Alvaro', ?, 'user', '2026-01-01', '2026-01-01')`,
			)
			.bind(alvaro)
			.run();
	});
	afterEach(async () => bindings.dispose());

	async function expense(amountMinor: number, overrides: Partial<ExpenseCreateInput> = {}) {
		const result = await createExpense(
			{
				name: "Gasto de prueba",
				amountMinor,
				currency: "CLP",
				kindId: "kind-other",
				expenseDate: "2026-09-15",
				paidByParticipantId: alvaro,
				participantIds: [alvaro, camila, trinidad],
				...overrides,
			},
			"report-user",
			bindings.database,
			new Date("2026-10-01T12:00:00Z"),
		);
		if (result.err) throw result.val;
		return result.val;
	}

	it("compares inclusive periods and reconciles new, changed, and disappearing categories", async () => {
		await expense(100_000, { expenseDate: august.dateFrom, kindId: "kind-common-expenses" });
		await expense(20_000, {
			expenseDate: august.dateTo,
			kindId: "kind-water",
			paidByParticipantId: camila,
		});
		await expense(115_000, { expenseDate: september.dateFrom, kindId: "kind-common-expenses" });
		await expense(10_000, {
			expenseDate: september.dateTo,
			kindId: "kind-internet",
			paidByParticipantId: trinidad,
		});
		const deleted = await expense(300_000);
		await softDeleteExpense(deleted.id, bindings.database);
		await expense(999, { expenseDate: "2026-07-31" });
		await expense(999, { expenseDate: "2026-10-01" });
		await bindings.database
			.prepare("UPDATE participants SET active = 0 WHERE id = ?")
			.bind(trinidad)
			.run();

		const result = await getExpenseComparison(
			{ period: september, baseline: august },
			bindings.database,
		);
		if (result.err) throw result.val;
		const report = ExpenseComparisonSchema.parse(result.val);
		expect(report).toMatchObject({
			period: {
				...september,
				totalAmountMinor: 125_000,
				expenseCount: 2,
				dayCount: 30,
				coversFullMonths: true,
			},
			baseline: {
				...august,
				totalAmountMinor: 120_000,
				expenseCount: 2,
				dayCount: 31,
				coversFullMonths: true,
			},
			sameDayCount: false,
			change: { amountMinor: 5000, percent: 4.17 },
		});
		expect(report.categories).toMatchObject([
			{ kindId: "kind-water", change: { amountMinor: -20_000, percent: -100 } },
			{ kindId: "kind-common-expenses", change: { amountMinor: 15_000, percent: 15 } },
			{ kindId: "kind-internet", change: { amountMinor: 10_000, percent: null } },
		]);
		expect(report.categories.reduce((sum, row) => sum + row.change.amountMinor, 0)).toBe(5000);

		const filtered = await getExpenseComparison(
			{ period: september, baseline: august, kind: "kind-common-expenses", payer: alvaro },
			bindings.database,
		);
		if (filtered.err) throw filtered.val;
		expect(filtered.val.change).toEqual({ amountMinor: 15_000, percent: 15 });
		expect(filtered.val.categories).toHaveLength(1);
		const differentPayer = await getExpenseComparison(
			{ period: september, baseline: august, kind: "kind-common-expenses", payer: camila },
			bindings.database,
		);
		if (differentPayer.err) throw differentPayer.val;
		expect(differentPayer.val.period.totalAmountMinor).toBe(0);
		expect(differentPayer.val.baseline.totalAmountMinor).toBe(0);
	});

	it("returns null percentages for zero baselines and labels month-to-date ranges", async () => {
		const period = { ...september, dateTo: "2026-09-15" };
		const empty = await getExpenseComparison({ period, baseline: august }, bindings.database);
		if (empty.err) throw empty.val;
		expect(empty.val.change).toEqual({ amountMinor: 0, percent: null });
		expect(empty.val.categories).toEqual([]);
		expect(empty.val.period).toMatchObject({ dayCount: 15, coversFullMonths: false });
		await expense(1000);
		const added = await getExpenseComparison({ period, baseline: august }, bindings.database);
		if (added.err) throw added.val;
		expect(added.val.change).toEqual({ amountMinor: 1000, percent: null });
	});

	it("fills empty months, clips boundaries, and handles leap years and payer/category filters", async () => {
		await expense(12, { expenseDate: "2023-12-31", paidByParticipantId: camila });
		await expense(24, { expenseDate: "2024-02-29", paidByParticipantId: camila });
		await expense(999, { expenseDate: "2023-12-30", paidByParticipantId: camila });
		await expense(999, { expenseDate: "2024-03-01", paidByParticipantId: camila });
		await expense(999, { expenseDate: "2024-01-01", paidByParticipantId: alvaro });
		await expense(999, {
			expenseDate: "2024-01-01",
			paidByParticipantId: camila,
			kindId: "kind-water",
		});
		const deleted = await expense(999, { expenseDate: "2024-01-01", paidByParticipantId: camila });
		await softDeleteExpense(deleted.id, bindings.database);
		const result = await getExpenseTrends(
			{ dateFrom: "2023-12-31", dateTo: "2024-02-29", kind: "kind-other", payer: camila },
			bindings.database,
		);
		if (result.err) throw result.val;
		const report = ExpenseTrendsSchema.parse(result.val);
		expect(report).toMatchObject({
			totalAmountMinor: 36,
			expenseCount: 2,
			coversFullMonths: false,
		});
		expect(report.months).toMatchObject([
			{
				month: "2023-12",
				dateFrom: "2023-12-31",
				dayCount: 1,
				totalAmountMinor: 12,
				coversFullMonths: false,
			},
			{
				month: "2024-01",
				dayCount: 31,
				totalAmountMinor: 0,
				expenseCount: 0,
				categories: [],
				coversFullMonths: true,
			},
			{ month: "2024-02", dayCount: 29, totalAmountMinor: 24, coversFullMonths: true },
		]);
		const clipped = await getExpenseTrends(
			{ dateFrom: "2024-02-01", dateTo: "2024-02-15" },
			bindings.database,
		);
		if (clipped.err) throw clipped.val;
		expect(clipped.val.months).toMatchObject([
			{ dateTo: "2024-02-15", dayCount: 15, coversFullMonths: false, totalAmountMinor: 0 },
		]);
	});

	it("separates personal allocation, upfront payments, and current reimbursements without multiplying joins", async () => {
		await expense(90_000, { initialPaidParticipantIds: [camila] });
		await expense(20_000, {
			participantIds: [camila, trinidad],
			initialPaidParticipantIds: [trinidad],
		});
		await expense(60_000, { paidByParticipantId: camila, initialPaidParticipantIds: [alvaro] });
		await expense(40_000, {
			kindId: "kind-water",
			paidByParticipantId: trinidad,
			participantIds: [alvaro, trinidad],
			splitMode: "custom",
			shareAllocations: [
				{ participantId: alvaro, shareAmountMinor: 10_000 },
				{ participantId: trinidad, shareAmountMinor: 30_000 },
			],
		});
		await expense(50_000, {
			kindId: "kind-water",
			paidByParticipantId: camila,
			participantIds: [alvaro, camila],
			splitMode: "open",
			shareAllocations: [
				{ participantId: alvaro, shareAmountMinor: 0 },
				{ participantId: camila, shareAmountMinor: 50_000 },
			],
		});
		await expense(12_000, { paidByParticipantId: camila, participantIds: [trinidad] });
		await expense(999, { expenseDate: "2026-08-31" });
		const deleted = await expense(999);
		await softDeleteExpense(deleted.id, bindings.database);
		const result = await getMySpendingReport(september, alvaro, bindings.database);
		if (result.err) throw result.val;
		const report = MySpendingSchema.parse(result.val);
		expect(report).toMatchObject({
			participantId: alvaro,
			expenseCount: 5,
			allocatedAmountMinor: 60_000,
			paidUpfrontAmountMinor: 110_000,
			reimbursedAmountMinor: 20_000,
			receivedReimbursementsAmountMinor: 40_000,
			pendingToPayAmountMinor: 10_000,
			pendingToReceiveAmountMinor: 40_000,
			dateBasis: "expense_date",
			reimbursementBasis: "current_status",
		});
		expect(report.categories).toMatchObject([
			{
				kindId: "kind-other",
				allocatedAmountMinor: 50_000,
				paidUpfrontAmountMinor: 110_000,
				expenseCount: 3,
			},
			{
				kindId: "kind-water",
				allocatedAmountMinor: 10_000,
				paidUpfrontAmountMinor: 0,
				expenseCount: 2,
			},
		]);
		const filtered = await getMySpendingReport(
			{ ...september, kind: "kind-water" },
			alvaro,
			bindings.database,
		);
		if (filtered.err) throw filtered.val;
		expect(filtered.val.allocatedAmountMinor).toBe(10_000);
		expect(filtered.val.categories).toHaveLength(1);
		const other = await getMySpendingReport(september, camila, bindings.database);
		if (other.err) throw other.val;
		expect(other.val).toMatchObject({
			participantId: camila,
			allocatedAmountMinor: 110_000,
			paidUpfrontAmountMinor: 122_000,
			reimbursedAmountMinor: 30_000,
			pendingToPayAmountMinor: 10_000,
		});
	});

	it("returns an empty personal report with zero totals", async () => {
		const result = await getMySpendingReport(september, alvaro, bindings.database);
		if (result.err) throw result.val;
		expect(MySpendingSchema.parse(result.val)).toMatchObject({
			expenseCount: 0,
			allocatedAmountMinor: 0,
			paidUpfrontAmountMinor: 0,
			pendingToPayAmountMinor: 0,
			pendingToReceiveAmountMinor: 0,
			categories: [],
		});
	});

	it.each(["kind-other", "kind-water"])(
		"rejects unsafe aggregates within or across categories (%s)",
		async (kindId) => {
			await expense(Number.MAX_SAFE_INTEGER, { participantIds: [alvaro] });
			await expense(1, { kindId, participantIds: [alvaro] });
			const comparison = await getExpenseComparison(
				{ period: september, baseline: august },
				bindings.database,
			);
			const trends = await getExpenseTrends(september, bindings.database);
			const personal = await getMySpendingReport(september, alvaro, bindings.database);
			expect(comparison.err).toBe(true);
			expect(trends.err).toBe(true);
			expect(personal.err).toBe(true);
		},
	);
});
