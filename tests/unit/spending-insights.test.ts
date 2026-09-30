import { describe, expect, it } from "vitest";
import {
	ExpenseComparisonInputSchema,
	ExpenseTrendsInputSchema,
	MySpendingInputSchema,
	SpendingRangeSchema,
} from "@/lib/types/spending-insights";
import {
	calendarMonthBounds,
	calendarMonthIndex,
	checkedTotal,
	describeSpendingPeriod,
	spendingChange,
} from "@/lib/util/spending-insights";

describe("spending insight periods and arithmetic", () => {
	it.each([
		["2024-02-01", "2024-02-29", 29, true],
		["2026-02-01", "2026-02-28", 28, true],
		["2025-12-01", "2026-01-31", 62, true],
		["2026-09-01", "2026-09-15", 15, false],
		["2026-09-15", "2026-09-30", 16, false],
		["2026-09-30", "2026-09-30", 1, false],
	])("describes %s through %s", (dateFrom, dateTo, dayCount, coversFullMonths) => {
		expect(describeSpendingPeriod({ dateFrom, dateTo })).toEqual({
			dateFrom,
			dateTo,
			dayCount,
			coversFullMonths,
		});
	});

	it("keeps calendar month boundaries across leap years and year transitions", () => {
		expect(calendarMonthBounds(calendarMonthIndex("2024-02-10"))).toEqual({
			dateFrom: "2024-02-01",
			dateTo: "2024-02-29",
		});
		expect(calendarMonthBounds(calendarMonthIndex("2025-12-01") + 1)).toEqual({
			dateFrom: "2026-01-01",
			dateTo: "2026-01-31",
		});
	});

	it.each([
		["2026-02-29", "2026-03-01"],
		["2026-09-30", "2026-09-01"],
		["2020-01-01", "2025-01-01"],
		["not-a-date", "2026-09-30"],
	])("rejects invalid or oversized ranges %s through %s", (dateFrom, dateTo) => {
		const range = { dateFrom, dateTo };
		expect(SpendingRangeSchema.safeParse(range).success).toBe(false);
		expect(ExpenseTrendsInputSchema.safeParse(range).success).toBe(false);
		expect(MySpendingInputSchema.safeParse(range).success).toBe(false);
		expect(
			ExpenseComparisonInputSchema.safeParse({
				period: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
				baseline: range,
			}).success,
		).toBe(false);
	});

	it("allows exactly sixty calendar months", () => {
		expect(
			SpendingRangeSchema.safeParse({ dateFrom: "2020-01-01", dateTo: "2024-12-31" }).success,
		).toBe(true);
	});

	it.each([
		[115_000, 100_000, 15_000, 15],
		[80_000, 100_000, -20_000, -20],
		[125_000, 120_000, 5000, 4.17],
		[0, 1000, -1000, -100],
		[1000, 0, 1000, null],
		[0, 0, 0, null],
	])("compares %d against %d", (amount, baseline, amountMinor, percent) => {
		expect(spendingChange(amount, baseline)).toEqual({ amountMinor, percent });
	});

	it("rejects unsafe monetary values and sums", () => {
		expect(checkedTotal([Number.MAX_SAFE_INTEGER - 1, 1])).toBe(Number.MAX_SAFE_INTEGER);
		expect(() => checkedTotal([Number.MAX_SAFE_INTEGER, 1])).toThrow();
		for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => checkedTotal([invalid])).toThrow();
		}
	});
});
