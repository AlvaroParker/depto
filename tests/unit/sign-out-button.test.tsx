// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));

import { SignOutButton } from "@/components/layout/sign-out-button";

describe("SignOutButton", () => {
	beforeEach(() => mocks.signOut.mockReset());
	afterEach(cleanup);

	it("keeps the compact icon-only control by default", () => {
		render(<SignOutButton />);
		const button = screen.getByRole("button", { name: "Cerrar sesión" });

		expect(button).toHaveClass("size-11", "p-0");
		expect(button).toHaveTextContent("");
	});

	it("renders a full-width labeled variant and signs out to login", async () => {
		const user = userEvent.setup();
		render(<SignOutButton className="justify-start" showLabel />);
		const button = screen.getByRole("button", { name: "Cerrar sesión" });

		expect(button).toHaveClass("w-full", "justify-start");
		await user.click(button);
		expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
	});
});
