const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amountMinor: number, currency = "CLP"): string {
	let formatter = currencyFormatters.get(currency);
	if (!formatter) {
		formatter = new Intl.NumberFormat("es-CL", {
			currency,
			maximumFractionDigits: 0,
			style: "currency",
		});
		currencyFormatters.set(currency, formatter);
	}
	return formatter.format(amountMinor);
}

export function formatExpenseDate(value: string): string {
	const [year, month, day] = value.split("-").map(Number);
	return new Intl.DateTimeFormat("es-CL", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
		year: "numeric",
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateTime(value: string): string {
	return new Intl.DateTimeFormat("es-CL", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}
