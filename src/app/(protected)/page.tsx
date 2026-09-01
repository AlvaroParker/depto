import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PendingMatrix } from "@/components/dashboard/pending-matrix";
import { PersonalDebtOverview } from "@/components/dashboard/personal-debt-overview";
import { PersonalObligations } from "@/components/dashboard/personal-obligations";
import { PersonalSummaryCards } from "@/components/dashboard/personal-summary-cards";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ExpenseList } from "@/components/expenses/expense-list";
import { getDashboardSummary } from "@/lib/db/dashboard";
import { findBankTransferDetailsByParticipantIds } from "@/lib/db/bank-accounts";
import type { ExpenseSummary } from "@/lib/types/expense";

function RecentExpenses({
	expenses,
	participantId,
}: {
	expenses: ExpenseSummary[];
	participantId?: string | null;
}) {
	return (
		<section className="mt-10">
			<div className="mb-5 flex flex-wrap items-end justify-between gap-4">
				<div className="min-w-0">
					<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
						Últimos movimientos
					</p>
					<h2 className="font-display mt-1 text-3xl font-semibold">
						{participantId ? "Tus gastos recientes" : "Gastos recientes"}
					</h2>
				</div>
				<Link
					className="text-accent-strong inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap"
					href="/expenses"
				>
					Ver todos
				</Link>
			</div>
			<ExpenseList
				expenses={expenses}
				personalParticipantId={participantId}
				showPersonalEmptyState={false}
			/>
		</section>
	);
}

export default async function DashboardPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const result = await getDashboardSummary({
		currentParticipantId: session.user.participantId,
	});
	if (result.err) throw new Error("Could not load dashboard.");
	const dashboard = result.val;
	const bankTransferDetails =
		dashboard.view === "personal"
			? await findBankTransferDetailsByParticipantIds(
					dashboard.debtsByParticipant
						.filter(({ amountOwedMinor }) => amountOwedMinor > 0)
						.map(({ participant }) => participant.id),
				)
			: null;
	if (bankTransferDetails?.err) throw new Error("Could not load bank transfer details.");
	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				{dashboard.view === "personal" ? (
					<>
						<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
							Tu resumen
						</p>
						<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
							Hola, {session.user.displayName}.
						</h1>
						<p className="text-ink-muted mt-3 max-w-xl text-sm leading-6">
							Lo que debes, lo que te deben y cuánto has gastado hasta ahora.
						</p>
						<PersonalObligations summary={dashboard} />
						<PersonalDebtOverview
							bankTransferDetailsByParticipantId={bankTransferDetails?.val}
							debts={dashboard.debtsByParticipant}
						/>
						<PersonalSummaryCards summary={dashboard} />
						<RecentExpenses
							expenses={dashboard.recentExpenses}
							participantId={dashboard.participantId}
						/>
					</>
				) : (
					<>
						<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
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
						<RecentExpenses expenses={dashboard.recentExpenses} />
					</>
				)}
			</div>
		</main>
	);
}
