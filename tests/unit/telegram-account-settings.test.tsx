// @vitest-environment jsdom

import { Err, Ok } from "ts-results";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	removeTelegramUserId: vi.fn(),
	saveTelegramUserId: vi.fn(),
}));

vi.mock("@/lib/api/telegram", () => ({
	removeTelegramUserId: mocks.removeTelegramUserId,
	saveTelegramUserId: mocks.saveTelegramUserId,
}));

import { TelegramAccountSettings } from "@/components/settings/telegram-account-settings";

describe("Telegram account settings", () => {
	beforeEach(() => {
		mocks.removeTelegramUserId.mockReset();
		mocks.saveTelegramUserId.mockReset();
	});
	afterEach(cleanup);

	it("explains the authorization granted by a declared, unverified Telegram account", () => {
		render(<TelegramAccountSettings initialTelegramUserId={null} />);

		const input = screen.getByRole("textbox", { name: "ID de usuario de Telegram" });
		expect(input).toHaveValue("");
		expect(input).toHaveAttribute("inputmode", "numeric");
		expect(input).toHaveAttribute("pattern", "[1-9][0-9]{0,12}");
		expect(input).toHaveAttribute("maxlength", "13");
		expect(screen.getByText("Usa el ID numérico, no tu @usuario.")).toBeVisible();
		expect(
			screen.getByText(/no verificamos que esa cuenta de Telegram te pertenezca/i),
		).toBeVisible();
		expect(screen.getByText(/autorizas al bot a registrar gastos en tu nombre/)).toBeVisible();
		expect(screen.getByText(/Eliminarlo revoca ese acceso/)).toBeVisible();
		expect(screen.queryByText("Configurado")).not.toBeInTheDocument();
	});

	it("shows the complete configured ID and replacement controls", () => {
		render(<TelegramAccountSettings initialTelegramUserId="1099511627775" />);

		expect(screen.getByRole("textbox", { name: "ID de usuario de Telegram" })).toHaveValue(
			"1099511627775",
		);
		expect(screen.getByText("Configurado")).toBeVisible();
		expect(screen.getByRole("button", { name: "Actualizar ID" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Eliminar ID" })).toBeVisible();
	});

	it("saves a new ID and announces success", async () => {
		mocks.saveTelegramUserId.mockResolvedValue(Ok({ telegramUserId: "123456789" }));
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId={null} />);

		await user.type(
			screen.getByRole("textbox", { name: "ID de usuario de Telegram" }),
			"123456789",
		);
		await user.click(screen.getByRole("button", { name: "Guardar ID" }));

		expect(mocks.saveTelegramUserId).toHaveBeenCalledWith({ telegramUserId: "123456789" });
		expect(await screen.findByRole("status")).toHaveTextContent("Tu ID de Telegram fue guardado.");
		expect(screen.getByText("Configurado")).toBeVisible();
	});

	it("replaces a configured ID and keeps the returned canonical value", async () => {
		mocks.saveTelegramUserId.mockResolvedValue(Ok({ telegramUserId: "987654321012" }));
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId="123456789" />);
		const input = screen.getByRole("textbox", { name: "ID de usuario de Telegram" });

		await user.clear(input);
		await user.type(input, "987654321012");
		await user.click(screen.getByRole("button", { name: "Actualizar ID" }));

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Tu ID de Telegram fue actualizado.",
		);
		expect(input).toHaveValue("987654321012");
	});

	it("confirms removal in an accessible dialog and announces completion", async () => {
		mocks.removeTelegramUserId.mockResolvedValue(Ok(null));
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId="987654321012" />);

		await user.click(screen.getByRole("button", { name: "Eliminar ID" }));
		const dialog = screen.getByRole("dialog", { name: "Eliminar ID de Telegram" });
		expect(dialog).toHaveTextContent("987654321012");
		await user.click(within(dialog).getByRole("button", { name: "Eliminar ID" }));

		expect(mocks.removeTelegramUserId).toHaveBeenCalledOnce();
		expect(await screen.findByRole("status")).toHaveTextContent("Tu ID de Telegram fue eliminado.");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "ID de usuario de Telegram" })).toHaveValue("");
	});

	it("rejects usernames locally with a field-level error", async () => {
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId={null} />);
		const input = screen.getByRole("textbox", { name: "ID de usuario de Telegram" });

		await user.type(input, "@alvaro");
		await user.click(screen.getByRole("button", { name: "Guardar ID" }));

		expect(screen.getByText("Ingresa un ID numérico de Telegram válido.")).toBeVisible();
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(mocks.saveTelegramUserId).not.toHaveBeenCalled();
	});

	it("shows duplicate conflicts beside the field", async () => {
		mocks.saveTelegramUserId.mockResolvedValue(
			Err({
				code: "TELEGRAM_USER_ID_TAKEN",
				errors: {
					telegramUserId: ["Ese ID de Telegram ya está configurado en otra cuenta."],
				},
				message: "Ese ID de Telegram ya está configurado en otra cuenta.",
			}),
		);
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId={null} />);
		const input = screen.getByRole("textbox", { name: "ID de usuario de Telegram" });

		await user.type(input, "123456789");
		await user.click(screen.getByRole("button", { name: "Guardar ID" }));

		expect(
			await screen.findByText("Ese ID de Telegram ya está configurado en otra cuenta."),
		).toBeVisible();
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	it("announces connection failures as a general error", async () => {
		mocks.saveTelegramUserId.mockResolvedValue(
			Err({ message: "No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente." }),
		);
		const user = userEvent.setup();
		render(<TelegramAccountSettings initialTelegramUserId={null} />);

		await user.type(
			screen.getByRole("textbox", { name: "ID de usuario de Telegram" }),
			"123456789",
		);
		await user.click(screen.getByRole("button", { name: "Guardar ID" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente.",
		);
	});
});
