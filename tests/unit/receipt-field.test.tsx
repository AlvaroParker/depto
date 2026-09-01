// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	refresh: vi.fn(),
	uploadReceipt: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/api/receipts", () => ({
	uploadReceipt: mocks.uploadReceipt,
}));

import { ReceiptField } from "@/components/expenses/receipt-field";

describe("ReceiptField", () => {
	beforeEach(() => {
		mocks.refresh.mockReset();
		mocks.uploadReceipt.mockReset();
	});

	afterEach(cleanup);

	it("exposes only the visible upload button and announces progress", async () => {
		mocks.uploadReceipt.mockImplementation(
			(_expenseId: string, _file: File, onProgress?: (percent: number) => void) => {
				onProgress?.(37);
				return new Promise(() => undefined);
			},
		);
		const user = userEvent.setup();
		const { container } = render(<ReceiptField expenseId="expense-1" />);
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');
		const button = screen.getByRole("button", { name: "Subir comprobante" });

		expect(input).not.toBeNull();
		expect(input).toHaveAttribute("aria-hidden", "true");
		expect(input).toHaveAttribute("tabindex", "-1");
		const click = vi.spyOn(input!, "click");
		await user.click(button);
		expect(click).toHaveBeenCalledOnce();

		fireEvent.change(input!, {
			target: {
				files: [new File(["receipt"], "boleta.pdf", { type: "application/pdf" })],
			},
		});

		expect(await screen.findByRole("button", { name: "Subiendo 37%" })).toHaveAttribute(
			"aria-busy",
			"true",
		);
		expect(screen.getByRole("status")).toHaveTextContent("Subiendo comprobante: 37%");
	});

	it("announces invalid file errors without starting an upload", () => {
		const { container } = render(<ReceiptField expenseId="expense-1" />);
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');

		fireEvent.change(input!, {
			target: {
				files: [new File(["notes"], "notas.txt", { type: "text/plain" })],
			},
		});

		expect(screen.getByRole("alert")).toHaveTextContent("Usa un archivo JPG, PNG, WebP o PDF.");
		expect(mocks.uploadReceipt).not.toHaveBeenCalled();
	});
});
