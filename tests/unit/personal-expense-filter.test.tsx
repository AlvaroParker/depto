import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExpenseQuerySchema, type ExpenseSummary } from "@/lib/types/expense";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn() }),
}));

const expense: ExpenseSummary = {
	amountMinor: 12_000,
	currency: "CLP",
	description: null,
	expenseDate: "2026-07-10",
	hasReceipt: false,
	id: "expense-personal",
	kind: { iconKey: "groceries", id: "kind-groceries", name: "Supermercado", sortOrder: 1 },
	name: "Compra semanal",
	payer: { id: "participant_camila", name: "Camila", slug: "camila", sortOrder: 2 },
	shares: [
		{
			id: "share-alvaro",
			markedByUserId: null,
			paidAt: null,
			paidToParticipantId: "participant_camila",
			participant: { id: "participant_alvaro", name: "Alvaro", slug: "alvaro", sortOrder: 1 },
			shareAmountMinor: 6_000,
			status: "pending",
		},
		{
			id: "share-camila",
			markedByUserId: null,
			paidAt: null,
			paidToParticipantId: null,
			participant: { id: "participant_camila", name: "Camila", slug: "camila", sortOrder: 2 },
			shareAmountMinor: 6_000,
			status: "settled",
		},
	],
};

describe("personal expense filter", () => {
	it("parses the personal pending query value", () => {
		expect(ExpenseQuerySchema.parse({ pending: "mine" }).pending).toBe("mine");
	});

	it("offers the personal state only to users with a participant", () => {
		const query = ExpenseQuerySchema.parse({});
		const regular = renderToStaticMarkup(
			<ExpenseFilters canFilterMyPending expenseKinds={[]} participants={[]} query={query} />,
		);
		const privileged = renderToStaticMarkup(
			<ExpenseFilters
				canFilterMyPending={false}
				expenseKinds={[]}
				participants={[]}
				query={query}
			/>,
		);

		expect(regular).toContain("Mis pagos pendientes");
		expect(privileged).not.toContain("Mis pagos pendientes");
	});

	it("emphasizes the user's pending share while retaining the expense total", () => {
		const markup = renderToStaticMarkup(
			<ExpenseList expenses={[expense]} personalParticipantId="participant_alvaro" />,
		);

		expect(markup).toContain("Debes");
		expect(markup).toContain("$6.000");
		expect(markup).toContain("Total $12.000");
		expect(markup).not.toContain("1 pendiente");
	});

	it("shows a checked personal state when the user paid or reimbursed the expense", () => {
		const reimbursedExpense: ExpenseSummary = {
			...expense,
			shares: expense.shares.map((share) =>
				share.participant.id === "participant_alvaro"
					? { ...share, paidAt: "2026-07-10T12:00:00.000Z", status: "paid" }
					: share,
			),
		};
		const paidByUserExpense: ExpenseSummary = {
			...expense,
			id: "expense-paid-by-user",
			payer: expense.shares[0].participant,
			shares: expense.shares.map((share) =>
				share.participant.id === "participant_alvaro"
					? { ...share, paidToParticipantId: null, status: "settled" }
					: share,
			),
		};

		const reimbursedMarkup = renderToStaticMarkup(
			<ExpenseList expenses={[reimbursedExpense]} personalParticipantId="participant_alvaro" />,
		);
		const payerMarkup = renderToStaticMarkup(
			<ExpenseList expenses={[paidByUserExpense]} personalParticipantId="participant_alvaro" />,
		);

		expect(reimbursedMarkup).toContain("Tu parte pagada");
		expect(reimbursedMarkup).not.toContain("1 pendiente");
		expect(payerMarkup).toContain("Pagaste tú");
		expect(payerMarkup).not.toContain("1 pendiente");
	});

	it("renders an all-clear state when no personal payments remain", () => {
		const markup = renderToStaticMarkup(
			<ExpenseList expenses={[]} personalParticipantId="participant_alvaro" />,
		);

		expect(markup).toContain("No tienes pagos pendientes");
		expect(markup).toContain("Ver todos los gastos");
	});

	it("keeps the household empty state when personal status is used on the dashboard", () => {
		const markup = renderToStaticMarkup(
			<ExpenseList
				expenses={[]}
				personalParticipantId="participant_alvaro"
				showPersonalEmptyState={false}
			/>,
		);

		expect(markup).toContain("Todavía no hay gastos");
		expect(markup).not.toContain("No tienes pagos pendientes");
	});
});
