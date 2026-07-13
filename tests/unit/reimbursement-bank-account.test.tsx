// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ReimbursementList } from "@/components/expenses/reimbursement-list";

describe("reimbursement bank account action", () => {
	beforeEach(() => vi.restoreAllMocks());
	afterEach(cleanup);

	it("copies the expense payer rather than the participant whose share is marked", async () => {
		const user = userEvent.setup();
		const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		render(
			<ReimbursementList
				amountMinor={10_000}
				currency="CLP"
				currentUser={{ participantId: "participant_camila", role: "user" }}
				initialShares={[
					{
						id: "share_camila",
						markedByUserId: null,
						paidAt: null,
						paidToParticipantId: "participant_alvaro",
						participant: {
							id: "participant_camila",
							name: "Camila",
							slug: "camila",
							sortOrder: 2,
						},
						paymentProof: null,
						shareAmountMinor: 5_000,
						status: "pending",
					},
				]}
				payeeBankTransferDetails={{
					accountNumber: "998877",
					accountType: "Cuenta Corriente",
					bankName: "Banco de Chile",
					email: "alvaro@example.com",
					name: "Alvaro",
					participantId: "participant_alvaro",
					rut: "18.972.631-7",
				}}
				payeeName="Alvaro"
				splitMode="equal"
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Marcar pagado: Camila" }));
		await user.click(screen.getByRole("button", { name: "Copiar datos bancarios" }));

		expect(writeText).toHaveBeenCalledWith(
			"Alvaro\n18.972.631-7\nCuenta Corriente\n998877\nBanco de Chile\nalvaro@example.com",
		);
	});
});
