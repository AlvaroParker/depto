import Link from "next/link";
import { PendingMatrix } from "@/components/dashboard/pending-matrix";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ExpenseList } from "@/components/expenses/expense-list";
import { getDashboardSummary } from "@/lib/db/dashboard";

export default async function DashboardPage() {
	const result = await getDashboardSummary();
	if (result.err) throw new Error("Could not load dashboard.");
	const dashboard = result.val;
	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
					Resumen del hogar
				</p>
				<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
					Todo en orden, de un vistazo.
				</h1>
				<p className="text-ink-muted mt-3 max-w-xl text-sm leading-6">
					Lo que pagó cada persona, cuánto le corresponde y qué falta por devolver.
				</p>
				<SummaryCards
					expenseCount={dashboard.expenseCount}
					pendingTotalMinor={dashboard.pendingTotalMinor}
					totalAmountMinor={dashboard.totalAmountMinor}
				/>
				<div className="mt-5">
					<PendingMatrix transfers={dashboard.pendingMatrix} />
				</div>
				<section className="mt-10">
					<div className="mb-5 flex items-end justify-between">
						<div>
							<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
								Últimos movimientos
							</p>
							<h2 className="font-display mt-1 text-3xl font-semibold">Gastos recientes</h2>
						</div>
						<Link className="text-accent text-sm font-semibold" href="/expenses">
							Ver todos
						</Link>
					</div>
					<ExpenseList expenses={dashboard.recentExpenses} />
				</section>
			</div>
		</main>
	);
}
