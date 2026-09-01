"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import type { ExpenseQuery } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

const SEARCH_DEBOUNCE_MS = 350;

interface FilterValues {
	kind: string;
	payer: string;
	pending: "" | "false" | "mine" | "true";
	q: string;
}

interface ActiveFilter {
	key: keyof FilterValues;
	label: string;
}

function valuesFromQuery(query: ExpenseQuery): FilterValues {
	return {
		kind: query.kind ?? "",
		payer: query.payer ?? "",
		pending: query.pending === undefined ? "" : (String(query.pending) as FilterValues["pending"]),
		q: query.q ?? "",
	};
}

export function ExpenseFilters({
	canFilterMyPending,
	expenseKinds,
	participants,
	query,
}: {
	canFilterMyPending: boolean;
	expenseKinds: ExpenseKind[];
	participants: Participant[];
	query: ExpenseQuery;
}) {
	const router = useRouter();
	const initialValues = valuesFromQuery(query);
	const [values, setValues] = useState(initialValues);
	const [appliedValues, setAppliedValues] = useState(initialValues);
	const [pending, startTransition] = useTransition();
	const valuesRef = useRef(values);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		},
		[],
	);

	function clearSearchTimer() {
		if (!searchTimerRef.current) return;
		clearTimeout(searchTimerRef.current);
		searchTimerRef.current = null;
	}

	function updateValues(nextValues: FilterValues) {
		valuesRef.current = nextValues;
		setValues(nextValues);
	}

	function navigate(nextValues: FilterValues) {
		clearSearchTimer();
		updateValues(nextValues);
		setAppliedValues(nextValues);
		const params = new URLSearchParams();
		const search = nextValues.q.trim();
		if (search) params.set("q", search);
		if (nextValues.kind) params.set("kind", nextValues.kind);
		if (nextValues.payer) params.set("payer", nextValues.payer);
		params.set("pending", nextValues.pending || "all");
		if (query.pageSize !== 25) params.set("pageSize", String(query.pageSize));
		const href = params.size ? `/expenses?${params}` : "/expenses";
		startTransition(() => router.replace(href, { scroll: false }));
	}

	function updateFilter(key: Exclude<keyof FilterValues, "q">, value: string) {
		const nextValues = { ...valuesRef.current, [key]: value } as FilterValues;
		navigate(nextValues);
	}

	function updateSearch(q: string) {
		const nextValues = { ...valuesRef.current, q };
		updateValues(nextValues);
		clearSearchTimer();
		searchTimerRef.current = setTimeout(() => navigate(valuesRef.current), SEARCH_DEBOUNCE_MS);
	}

	function submitSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		navigate(valuesRef.current);
	}

	function clearFilter(key: keyof FilterValues) {
		navigate({ ...valuesRef.current, [key]: "" });
	}

	function clearAllFilters() {
		navigate({ kind: "", payer: "", pending: "", q: "" });
	}

	const activeFilters: ActiveFilter[] = [];
	if (appliedValues.q.trim()) {
		activeFilters.push({ key: "q", label: `Búsqueda: “${appliedValues.q.trim()}”` });
	}
	if (appliedValues.kind) {
		const kind = expenseKinds.find((item) => item.id === appliedValues.kind);
		activeFilters.push({ key: "kind", label: `Categoría: ${kind?.name ?? appliedValues.kind}` });
	}
	if (appliedValues.payer) {
		const participant = participants.find((item) => item.id === appliedValues.payer);
		activeFilters.push({
			key: "payer",
			label: `Pagó: ${participant?.name ?? appliedValues.payer}`,
		});
	}
	if (appliedValues.pending) {
		const statusLabels = {
			false: "Todo reembolsado",
			mine: "Mis pagos pendientes",
			true: "Con pendientes",
		};
		activeFilters.push({
			key: "pending",
			label: `Estado: ${statusLabels[appliedValues.pending]}`,
		});
	}

	return (
		<form
			aria-busy={pending}
			className="border-line bg-paper mb-6 grid max-w-full min-w-0 gap-3 rounded-2xl border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]"
			method="get"
			onSubmit={submitSearch}
		>
			<label className="relative min-w-0">
				<span className="sr-only">Buscar gastos</span>
				<Search aria-hidden className="text-ink-faint absolute top-3.5 left-3" size={18} />
				<input
					className="border-line-strong bg-paper-strong/45 focus:border-accent focus:ring-accent/15 min-h-11 w-full max-w-full min-w-0 rounded-xl border pr-3 pl-10 text-sm outline-none focus:ring-2"
					name="q"
					onChange={(event) => updateSearch(event.target.value)}
					placeholder="Buscar nombre o descripción"
					value={values.q}
				/>
			</label>
			<label className="min-w-0">
				<span className="sr-only">Filtrar por categoría</span>
				<select
					className="border-line-strong bg-paper focus:border-accent focus:ring-accent/15 min-h-11 w-full max-w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus:ring-2"
					name="kind"
					onChange={(event) => updateFilter("kind", event.target.value)}
					value={values.kind}
				>
					<option value="">Cualquier categoría</option>
					{expenseKinds.map((kind) => (
						<option key={kind.id} value={kind.id}>
							{kind.name}
						</option>
					))}
				</select>
			</label>
			<label className="min-w-0">
				<span className="sr-only">Filtrar por quién pagó</span>
				<select
					className="border-line-strong bg-paper focus:border-accent focus:ring-accent/15 min-h-11 w-full max-w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus:ring-2"
					name="payer"
					onChange={(event) => updateFilter("payer", event.target.value)}
					value={values.payer}
				>
					<option value="">Cualquier persona</option>
					{participants.map((participant) => (
						<option key={participant.id} value={participant.id}>
							Pagó {participant.name}
						</option>
					))}
				</select>
			</label>
			<label className="min-w-0">
				<span className="sr-only">Filtrar por estado</span>
				<select
					className="border-line-strong bg-paper focus:border-accent focus:ring-accent/15 min-h-11 w-full max-w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus:ring-2"
					name="pending"
					onChange={(event) => updateFilter("pending", event.target.value)}
					value={values.pending}
				>
					<option value="">Cualquier estado</option>
					<option value="true">Con pendientes</option>
					{canFilterMyPending ? <option value="mine">Mis pagos pendientes</option> : null}
					<option value="false">Todo reembolsado</option>
				</select>
			</label>
			{activeFilters.length ? (
				<div className="border-line col-span-full flex flex-wrap items-center gap-2 border-t pt-3">
					<span className="text-ink-muted mr-1 text-xs font-semibold">Filtros activos</span>
					{activeFilters.map((filter) => (
						<button
							aria-label={`Quitar ${filter.label}`}
							className="border-accent/20 bg-accent/8 text-accent-strong hover:bg-accent/14 focus:ring-accent/25 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3 text-left text-xs font-semibold transition outline-none focus:ring-2"
							key={filter.key}
							onClick={() => clearFilter(filter.key)}
							type="button"
						>
							{filter.label}
							<X aria-hidden size={14} />
						</button>
					))}
					<button
						className="text-ink-muted hover:text-ink focus:ring-line-strong min-h-11 rounded-full px-3 text-xs font-semibold underline decoration-1 underline-offset-4 outline-none focus:ring-2"
						onClick={clearAllFilters}
						type="button"
					>
						Limpiar todos
					</button>
				</div>
			) : null}
			<p aria-live="polite" className="text-ink-faint col-span-full min-h-4 text-right text-xs">
				{pending ? "Actualizando resultados…" : ""}
			</p>
		</form>
	);
}
