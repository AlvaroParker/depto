interface DateRange {
	dateFrom: string;
	dateTo: string;
}

export function calendarMonthIndex(date: string): number {
	return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

export function calendarMonthBounds(index: number): DateRange {
	const year = Math.floor(index / 12);
	const month = index % 12;
	const first = new Date(0);
	first.setUTCFullYear(year, month, 1);
	const last = new Date(first);
	last.setUTCMonth(month + 1, 0);
	return {
		dateFrom: first.toISOString().slice(0, 10),
		dateTo: last.toISOString().slice(0, 10),
	};
}

export function describeSpendingPeriod(range: DateRange) {
	return {
		...range,
		dayCount: (Date.parse(range.dateTo) - Date.parse(range.dateFrom)) / 86_400_000 + 1,
		coversFullMonths:
			range.dateFrom.endsWith("-01") &&
			range.dateTo === calendarMonthBounds(calendarMonthIndex(range.dateTo)).dateTo,
	};
}

export function checkedTotal(values: number[]): number {
	let total = 0;
	for (const value of values) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error("Spending report contains an invalid integer amount or count.");
		}
		total += value;
		if (!Number.isSafeInteger(total))
			throw new Error("Spending report exceeds safe integer range.");
	}
	return total;
}

export function spendingChange(amount: number, baseline: number) {
	checkedTotal([amount]);
	checkedTotal([baseline]);
	const amountMinor = amount - baseline;
	return {
		amountMinor,
		percent: baseline === 0 ? null : Math.round((amountMinor / baseline) * 10_000) / 100,
	};
}
