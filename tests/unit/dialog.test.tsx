// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";

function DialogHarness({ description = "Detalles de la acción." }: { description?: string }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button onClick={() => setOpen(true)} type="button">
				Abrir diálogo
			</button>
			<Dialog
				description={description}
				onClose={() => setOpen(false)}
				open={open}
				title="Confirmar cambio"
			>
				<button type="button">Confirmar</button>
			</Dialog>
		</>
	);
}

describe("Dialog", () => {
	beforeEach(() => {
		Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
			configurable: true,
			value(this: HTMLDialogElement) {
				this.setAttribute("open", "");
			},
		});
		Object.defineProperty(HTMLDialogElement.prototype, "close", {
			configurable: true,
			value(this: HTMLDialogElement) {
				this.removeAttribute("open");
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		document.body.style.overflow = "";
		cleanup();
	});

	it("keeps the native dialog mounted and synchronizes accessible modal state", async () => {
		const user = userEvent.setup();
		const { container } = render(<DialogHarness />);
		const trigger = screen.getByRole("button", { name: "Abrir diálogo" });

		expect(container.querySelector("dialog")).not.toHaveAttribute("open");
		expect(screen.queryByText("Confirmar")).not.toBeInTheDocument();
		await user.click(trigger);

		const dialog = screen.getByRole("dialog", { name: "Confirmar cambio" });
		expect(dialog).toHaveAttribute("aria-modal", "true");
		expect(dialog).toHaveAccessibleDescription("Detalles de la acción.");
		expect(document.body).toHaveStyle({ overflow: "hidden" });
		expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

		await user.click(screen.getByRole("button", { name: "Cerrar" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(trigger).toHaveFocus();
		expect(document.body.style.overflow).toBe("");
		expect(container.querySelector("dialog")).toBeInTheDocument();
		expect(screen.queryByText("Confirmar")).not.toBeInTheDocument();
	});

	it("moves focus to a stable status when a successful action removes its trigger", async () => {
		function RemovalHarness() {
			const [itemVisible, setItemVisible] = useState(true);
			const [notice, setNotice] = useState("");
			const [open, setOpen] = useState(false);
			return (
				<main>
					<h1>Administrar elementos</h1>
					{notice ? <p role="status">{notice}</p> : null}
					{itemVisible ? (
						<button onClick={() => setOpen(true)} type="button">
							Eliminar elemento
						</button>
					) : null}
					<Dialog onClose={() => setOpen(false)} open={open} title="Confirmar eliminación">
						<button
							onClick={() => {
								setItemVisible(false);
								setNotice("Elemento eliminado.");
								setOpen(false);
							}}
							type="button"
						>
							Confirmar eliminación
						</button>
					</Dialog>
				</main>
			);
		}

		const user = userEvent.setup();
		render(<RemovalHarness />);
		await user.click(screen.getByRole("button", { name: "Eliminar elemento" }));
		await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));

		const status = await screen.findByRole("status");
		await waitFor(() => expect(status).toHaveFocus());
	});

	it("routes the native Escape cancellation through the controlled close callback", async () => {
		const user = userEvent.setup();
		render(<DialogHarness />);
		const trigger = screen.getByRole("button", { name: "Abrir diálogo" });
		await user.click(trigger);

		const dialog = screen.getByRole("dialog", { name: "Confirmar cambio" });
		fireEvent(dialog, new Event("cancel", { cancelable: true }));

		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(trigger).toHaveFocus();
	});

	it("wraps forward and reverse Tab navigation at the dialog edges", async () => {
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
			{},
		] as unknown as DOMRectList);
		const user = userEvent.setup();
		render(<DialogHarness />);
		await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));

		const dialog = screen.getByRole("dialog", { name: "Confirmar cambio" });
		const close = screen.getByRole("button", { name: "Cerrar" });
		const confirm = screen.getByRole("button", { name: "Confirmar" });
		fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
		expect(confirm).toHaveFocus();
		fireEvent.keyDown(confirm, { key: "Tab" });
		expect(close).toHaveFocus();
		expect(dialog).toContainElement(document.activeElement as HTMLElement);
	});
});
