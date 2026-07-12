// @vitest-environment jsdom

import { Ok } from "ts-results";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ payAllDebt: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api/bulk-payments", () => ({ payAllDebt: mocks.payAllDebt }));

import { PersonalDebtOverview } from "@/components/dashboard/personal-debt-overview";

const debt = {
	amountDueToMeExpenseCount: 1,
	amountDueToMeMinor: 30_000,
	amountOwedExpenseCount: 6,
	amountOwedMinor: 100_000,
	participant: { id: "participant_camila", name: "Camila", slug: "camila", sortOrder: 2 },
};

describe("bulk payment dashboard", () => {
	beforeEach(() => {
		mocks.payAllDebt.mockReset();
		mocks.refresh.mockReset();
	});
	afterEach(cleanup);

	it("explains the directional aggregate before confirming", async () => {
		const user = userEvent.setup();
		render(<PersonalDebtOverview debts={[debt]} />);

		await user.click(
			screen.getByRole("button", { name: "Pagar todo lo que debes a Camila: $100.000" }),
		);
		expect(screen.getByRole("dialog", { name: "Pagar deuda a Camila" })).toBeVisible();
		expect(screen.getByText(/6 gastos por un total de \$100\.000/)).toBeVisible();
		expect(screen.getByText(/Camila todavía te deberá/)).toHaveTextContent("$30.000");
		expect(screen.getByText(/este pago no compensa esa deuda/)).toBeVisible();
	});

	it("announces the server aggregate and refreshes after success", async () => {
		mocks.payAllDebt.mockResolvedValue(
			Ok({
				amountPaidMinor: 100_000,
				paidAt: "2026-07-12T15:00:00.000Z",
				paidExpenseCount: 6,
				paidToParticipant: debt.participant,
				proofAttached: false,
			}),
		);
		const user = userEvent.setup();
		render(<PersonalDebtOverview debts={[debt]} />);

		await user.click(screen.getByRole("button", { name: /Pagar todo lo que debes/ }));
		await user.click(screen.getByRole("button", { name: "Pagar $100.000" }));

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Pago registrado: 6 gastos por $100.000 a Camila.",
		);
		expect(mocks.payAllDebt).toHaveBeenCalledWith("participant_camila", null, expect.any(Function));
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});
});
