import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { ExpenseList } from "@/components/expenses/expense-list";
import { listExpenses } from "@/lib/db/expenses";

export const metadata: Metadata = { title: "Gastos" };

export default async function ExpensesPage() {
	const result = await listExpenses();
	if (result.err) throw new Error("Could not load expenses.");
	return (
		<main className="mx-auto max-w-6xl px-4 py-7 sm:px-7 sm:py-10">
			<header className="mb-8 flex items-end justify-between gap-4">
				<div>
					<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
						Historial compartido
					</p>
					<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.03em]">Gastos</h1>
					<p className="text-ink-muted mt-2 text-sm">
						{result.val.total} registro{result.val.total === 1 ? "" : "s"}
					</p>
				</div>
				<Link
					className="bg-accent text-accent-foreground hidden min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold sm:flex"
					href="/expenses/new"
				>
					<Plus aria-hidden size={18} /> Agregar gasto
				</Link>
			</header>
			<ExpenseList expenses={result.val.expenses} />
		</main>
	);
}
