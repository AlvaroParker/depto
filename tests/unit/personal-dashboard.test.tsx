import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonalObligations } from "@/components/dashboard/personal-obligations";
import { PersonalSummaryCards } from "@/components/dashboard/personal-summary-cards";
import type { PersonalDashboardSummary } from "@/lib/types/dashboard";

const summary: PersonalDashboardSummary = {
	amountDueToMeMinor: 3_000,
	amountOwedMinor: 2_000,
	dueToMeExpenseCount: 1,
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
