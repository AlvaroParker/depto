// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankAccountCopyAction } from "@/components/payments/bank-account-copy-action";
import type { BankTransferDetails } from "@/lib/types/bank-account";

const details: BankTransferDetails = {
	accountNumber: "001234567",
	accountType: "Cuenta Vista",
	bankName: "Banco Estado",
	email: "camila@example.com",
	name: "Camila",
	participantId: "participant_camila",
	rut: "18.972.631-7",
};

describe("bank account copy action", () => {
	beforeEach(() => vi.restoreAllMocks());
	afterEach(cleanup);

	it("copies the exact transfer payload and announces success", async () => {
		const user = userEvent.setup();
		const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		render(<BankAccountCopyAction details={details} />);

		await user.click(screen.getByRole("button", { name: "Copiar datos bancarios" }));

		expect(writeText).toHaveBeenCalledWith(
			"Camila\n18.972.631-7\nCuenta Vista\n001234567\nBanco Estado\ncamila@example.com",
		);
		expect(screen.getByRole("status")).toHaveTextContent("Datos bancarios copiados");
	});

	it("shows a disabled state when details are unavailable", () => {
		render(<BankAccountCopyAction details={null} />);

		expect(screen.getByRole("button", { name: "Datos bancarios no registrados" })).toBeDisabled();
	});

	it("announces clipboard failures", async () => {
		const user = userEvent.setup();
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new Error("Clipboard unavailable"),
		);
		render(<BankAccountCopyAction details={details} />);

		await user.click(screen.getByRole("button", { name: "Copiar datos bancarios" }));

		expect(screen.getByRole("alert")).toHaveTextContent("No pudimos copiar");
	});
});
