import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonalDebtOverview } from "@/components/dashboard/personal-debt-overview";
import { PersonalObligations } from "@/components/dashboard/personal-obligations";
import { PersonalSummaryCards } from "@/components/dashboard/personal-summary-cards";
import type { PersonalDashboardSummary } from "@/lib/types/dashboard";

const summary: PersonalDashboardSummary = {
	amountDueToMeMinor: 3_000,
	amountOwedMinor: 2_000,
	dueToMeExpenseCount: 1,
	debtsByParticipant: [
		{
			amountDueToMeMinor: 3_000,
			amountOwedMinor: 0,
			participant: { id: "participant_trinidad", name: "Trinidad", slug: "trinidad", sortOrder: 3 },
		},
		{
			amountDueToMeMinor: 0,
			amountOwedMinor: 2_000,
			participant: { id: "participant_camila", name: "Camila", slug: "camila", sortOrder: 2 },
		},
	],
	expectedSpendMinor: 5_000,
	owedExpenseCount: 2,
	participantId: "participant_alvaro",
	recentExpenses: [],
	spentSoFarMinor: 6_000,
	view: "personal",
};

describe("personal dashboard", () => {
	it("shows both directions of the participant's active debts", () => {
		const markup = renderToStaticMarkup(<PersonalObligations summary={summary} />);

		expect(markup).toContain("Debes");
		expect(markup).toContain("$2.000");
		expect(markup).toContain("2 gastos pendientes");
		expect(markup).toContain("Te deben");
		expect(markup).toContain("$3.000");
		expect(markup).toContain("1 gasto por cobrar");
		expect(markup).toContain("/expenses?pending=mine");
		expect(markup).toContain("/expenses?payer=participant_alvaro&amp;pending=true");
	});

	it("explains current cash spent and the participant's final share", () => {
		const markup = renderToStaticMarkup(<PersonalSummaryCards summary={summary} />);

		expect(markup).toContain("Gastado hasta hoy");
		expect(markup).toContain("$6.000");
		expect(markup).toContain("Tu gasto total");
		expect(markup).toContain("$5.000");
	});

	it("lists participant debts in the supplied descending order without netting directions", () => {
		const markup = renderToStaticMarkup(
			<PersonalDebtOverview
				debts={[
					...summary.debtsByParticipant,
					{
						amountDueToMeMinor: 1_000,
						amountOwedMinor: 500,
						participant: { id: "participant_dual", name: "Dual", slug: "dual", sortOrder: 4 },
					},
				]}
			/>,
		);

		expect(markup).toContain("Deudas por persona");
		expect(markup.indexOf("Trinidad")).toBeLessThan(markup.indexOf("Camila"));
		expect(markup).toContain("Debes $2.000");
		expect(markup).toContain("Te debe $3.000");
		expect(markup).toContain("Debes $500");
		expect(markup).toContain("Te debe $1.000");
		expect(markup).toContain("overflow-y-auto");
	});

	it("shows an all-clear state when no participant relationships are active", () => {
		const markup = renderToStaticMarkup(<PersonalDebtOverview debts={[]} />);

		expect(markup).toContain("No hay deudas activas con otras personas");
	});

	it("renders a clear state without hiding zero amounts", () => {
		const markup = renderToStaticMarkup(
			<PersonalObligations
				summary={{
					...summary,
					amountDueToMeMinor: 0,
					amountOwedMinor: 0,
					dueToMeExpenseCount: 0,
					owedExpenseCount: 0,
				}}
			/>,
		);

		expect(markup).toContain("No debes nada");
		expect(markup).toContain("Todo está al día por ahora");
		expect(markup).toContain("No tienes reembolsos por cobrar");
		expect(markup).toContain("$0");
	});
});
