// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseForm } from "@/components/expenses/expense-form";
import type { ExpenseDetail } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const participants: Participant[] = [
	{ id: "participant_alvaro", name: "Alvaro", slug: "alvaro", sortOrder: 1 },
	{ id: "participant_camila", name: "Camila", slug: "camila", sortOrder: 2 },
	{ id: "participant_trinidad", name: "Trinidad", slug: "trinidad", sortOrder: 3 },
];
const expenseKinds: ExpenseKind[] = [
	{ iconKey: "other", id: "kind-other", name: "Otro", sortOrder: 1 },
];

function renderForm(
	expense?: ExpenseDetail,
	payers?: Participant[],
	availableParticipants = participants,
) {
	return render(
		<ExpenseForm
			defaultDate="2026-08-31"
			expense={expense}
			expenseKinds={expenseKinds}
			participants={availableParticipants}
			payers={payers}
		/>,
	);
}

function share(participant: Participant, amount: number) {
	return {
		id: `share-${participant.id}`,
		markedByUserId: null,
		paidAt: null,
		paidToParticipantId: "participant_alvaro",
		participant,
		paymentProof: null,
		shareAmountMinor: amount,
		status: "pending" as const,
	};
}

describe("expense form payer and share recipients", () => {
	afterEach(cleanup);

	it("keeps an equal-split payer outside the recipients and auto-adds them for an open split", () => {
		renderForm();
		const payer = screen.getByLabelText("¿Quién pagó?");
		const recipients = screen.getByRole("group", { name: "¿Entre quiénes se divide?" });
		const alvaroRecipient = within(recipients).getByRole("checkbox", { name: "Alvaro" });

		fireEvent.change(payer, { target: { value: "participant_alvaro" } });
		fireEvent.click(alvaroRecipient);
		expect(alvaroRecipient).not.toBeChecked();
		expect(payer).toHaveValue("participant_alvaro");

		fireEvent.click(screen.getByRole("radio", { name: /Cuenta abierta/ }));
		expect(alvaroRecipient).toBeChecked();
		expect(alvaroRecipient).toBeDisabled();
	});

	it("preserves an inactive current external payer without offering inactive former recipients", () => {
		const expense: ExpenseDetail = {
			amountMinor: 10_000,
			createdAt: "2026-08-31T12:00:00.000Z",
			createdByUserId: "user_admin",
			currency: "CLP",
			description: null,
			expenseDate: "2026-08-31",
			hasReceipt: false,
			id: "expense-external-payer",
			kind: expenseKinds[0],
			name: "Compra histórica",
			payer: participants[0],
			receiptContentType: null,
			receiptFilename: null,
			receiptSizeBytes: null,
			shares: [share(participants[1], 5_000), share(participants[2], 5_000)],
			splitMode: "equal",
			updatedAt: "2026-08-31T12:00:00.000Z",
		};
		renderForm(expense, [participants[0], participants[2]], participants.slice(1));

		const payer = screen.getByLabelText("¿Quién pagó?");
		expect(payer).toHaveValue("participant_alvaro");
		expect(within(payer).getByRole("option", { name: "Alvaro" })).toBeInTheDocument();
		expect(within(payer).queryByRole("option", { name: "Camila" })).not.toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /Cuenta abierta/ })).toBeDisabled();
		expect(screen.getByText(/elige primero a una persona activa/)).toBeInTheDocument();
		const recipients = screen.getByRole("group", { name: "¿Entre quiénes se divide?" });
		expect(within(recipients).queryByRole("checkbox", { name: "Alvaro" })).not.toBeInTheDocument();
		expect(within(recipients).getByRole("checkbox", { name: "Camila" })).toBeChecked();
	});
});
