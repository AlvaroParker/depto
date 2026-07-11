// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseQuerySchema } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace }),
}));

const expenseKinds: ExpenseKind[] = [
	{ iconKey: "water", id: "kind-water", name: "Agua", sortOrder: 1 },
];
const participants: Participant[] = [
	{ id: "participant-camila", name: "Camila", slug: "camila", sortOrder: 1 },
];

function renderFilters(rawQuery: Record<string, string> = {}) {
	return render(
		<ExpenseFilters
			canFilterMyPending
			expenseKinds={expenseKinds}
			participants={participants}
			query={ExpenseQuerySchema.parse(rawQuery)}
		/>,
	);
}

describe("expense filters", () => {
	beforeEach(() => {
		replace.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("applies select filters immediately while preserving the other filters", () => {
		renderFilters({ page: "3", pageSize: "50", q: "cuenta" });

		fireEvent.change(screen.getByLabelText("Filtrar por categoría"), {
			target: { value: "kind-water" },
		});

		expect(replace).toHaveBeenCalledWith("/expenses?q=cuenta&kind=kind-water&pageSize=50", {
			scroll: false,
		});
		expect(screen.queryByRole("button", { name: "Filtrar" })).not.toBeInTheDocument();
		expect(screen.getByText("Categoría: Agua")).toBeInTheDocument();
	});

	it("debounces text search and applies it immediately on submit", () => {
		vi.useFakeTimers();
		const { container } = renderFilters();
		const search = screen.getByLabelText("Buscar gastos");

		fireEvent.change(search, { target: { value: "luz" } });
		act(() => vi.advanceTimersByTime(349));
		expect(replace).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1));
		expect(replace).toHaveBeenLastCalledWith("/expenses?q=luz", { scroll: false });

		replace.mockClear();
		fireEvent.change(search, { target: { value: "internet" } });
		fireEvent.submit(container.querySelector("form")!);
		expect(replace).toHaveBeenLastCalledWith("/expenses?q=internet", { scroll: false });
	});

	it("renders human-readable chips and removes one filter at a time", () => {
		renderFilters({
			kind: "kind-water",
			payer: "participant-camila",
			pending: "mine",
			q: "cuenta",
		});

		expect(screen.getByText("Búsqueda: “cuenta”")).toBeInTheDocument();
		expect(screen.getByText("Categoría: Agua")).toBeInTheDocument();
		expect(screen.getByText("Pagó: Camila")).toBeInTheDocument();
		expect(screen.getByText("Estado: Mis pagos pendientes")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Quitar Categoría: Agua" }));
		expect(replace).toHaveBeenLastCalledWith(
			"/expenses?q=cuenta&payer=participant-camila&pending=mine",
			{ scroll: false },
		);
	});

	it("clears every filter at once", () => {
		renderFilters({ kind: "kind-water", q: "cuenta" });

		fireEvent.click(screen.getByRole("button", { name: "Limpiar todos" }));

		expect(replace).toHaveBeenLastCalledWith("/expenses", { scroll: false });
		expect(screen.queryByText("Filtros activos")).not.toBeInTheDocument();
	});
});
