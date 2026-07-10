import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import type { ExpenseQuery } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

export function ExpenseFilters({
	expenseKinds,
	participants,
	query,
}: {
	expenseKinds: ExpenseKind[];
	participants: Participant[];
	query: ExpenseQuery;
}) {
	const active = Boolean(query.q || query.kind || query.payer || query.pending !== undefined);
	return (
		<form
			className="border-line bg-paper mb-6 grid gap-3 rounded-2xl border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto]"
			method="get"
		>
			<label className="relative">
				<span className="sr-only">Buscar gastos</span>
				<Search aria-hidden className="text-ink-faint absolute top-3.5 left-3" size={18} />
				<input
					className="border-line-strong bg-paper-strong/45 focus:border-accent min-h-11 w-full rounded-xl border pr-3 pl-10 text-sm outline-none"
					defaultValue={query.q}
					name="q"
					placeholder="Buscar nombre o descripción"
				/>
			</label>
			<label>
				<span className="sr-only">Filtrar por categoría</span>
				<select
					className="border-line-strong bg-paper min-h-11 w-full rounded-xl border px-3 text-sm"
					defaultValue={query.kind ?? ""}
					name="kind"
				>
					<option value="">Cualquier categoría</option>
					{expenseKinds.map((kind) => (
						<option key={kind.id} value={kind.id}>
							{kind.name}
						</option>
					))}
				</select>
			</label>
			<label>
				<span className="sr-only">Filtrar por quién pagó</span>
				<select
					className="border-line-strong bg-paper min-h-11 w-full rounded-xl border px-3 text-sm"
					defaultValue={query.payer ?? ""}
					name="payer"
				>
					<option value="">Cualquier persona</option>
					{participants.map((participant) => (
						<option key={participant.id} value={participant.id}>
							Pagó {participant.name}
						</option>
					))}
				</select>
			</label>
			<label>
				<span className="sr-only">Filtrar por estado</span>
				<select
					className="border-line-strong bg-paper min-h-11 w-full rounded-xl border px-3 text-sm"
					defaultValue={query.pending === undefined ? "" : String(query.pending)}
					name="pending"
				>
					<option value="">Cualquier estado</option>
					<option value="true">Con pendientes</option>
					<option value="false">Todo reembolsado</option>
				</select>
			</label>
			<div className="flex gap-2">
				<button
					className="bg-ink text-paper inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
					type="submit"
				>
					<SlidersHorizontal aria-hidden size={16} /> Filtrar
				</button>
				{active ? (
					<Link
						aria-label="Limpiar filtros"
						className="border-line-strong grid size-11 place-items-center rounded-xl border"
						href="/expenses"
					>
						<X aria-hidden size={17} />
					</Link>
				) : null}
			</div>
		</form>
	);
}
