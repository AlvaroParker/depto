export const DEFAULT_EXPENSE_KIND_ID = "kind-other";

export const EXPENSE_KIND_ICON_KEYS = [
	"house",
	"building",
	"water",
	"electricity",
	"gas",
	"internet",
	"groceries",
	"food",
	"cleaning",
	"appliances",
	"furniture",
	"repairs",
	"transport",
	"health",
	"pets",
	"education",
	"other",
	"children",
	"car",
	"gift",
	"travel",
	"clothing",
	"fitness",
	"entertainment",
] as const;

export type ExpenseKindIconKey = (typeof EXPENSE_KIND_ICON_KEYS)[number];

export function isExpenseKindIconKey(value: string): value is ExpenseKindIconKey {
	return EXPENSE_KIND_ICON_KEYS.some((iconKey) => iconKey === value);
}
