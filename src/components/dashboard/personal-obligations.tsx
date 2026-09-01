import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { PersonalDashboardSummary } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

function expenseCountLabel(count: number): string {
	return `${count} ${count === 1 ? "gasto" : "gastos"}`;
}

export function PersonalObligations({ summary }: { summary: PersonalDashboardSummary }) {
	const allClear = summary.owedExpenseCount === 0 && summary.dueToMeExpenseCount === 0;
	return (
		<section className="border-line bg-paper mt-9 max-w-full min-w-0 overflow-hidden rounded-3xl border shadow-sm">
			<div className="grid min-w-0 lg:grid-cols-[1.35fr_0.65fr]">
				<div className="bg-ink text-paper relative min-w-0 overflow-hidden p-6 sm:p-8">
					<div
						aria-hidden
						className="bg-accent/18 absolute -top-16 right-0 size-44 rounded-full blur-2xl sm:-top-20 sm:size-56"
					/>
					<div className="relative min-w-0">
						<p className="text-paper/60 flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase">
							{summary.owedExpenseCount ? (
								<ArrowUpRight aria-hidden size={16} />
							) : (
								<CheckCircle2 aria-hidden size={16} />
							)}
							Tus pagos pendientes
						</p>
						<h2 className="font-display mt-5 text-2xl font-semibold">
							{summary.owedExpenseCount ? "Debes" : "No debes nada"}
						</h2>
						<p className="font-display mt-1 max-w-full text-[clamp(2rem,12vw,3.75rem)] leading-none font-semibold tracking-[-0.04em] [overflow-wrap:anywhere]">
							{formatMoney(summary.amountOwedMinor)}
						</p>
						<p className="text-paper/65 mt-3 text-sm">
							{summary.owedExpenseCount
								? `En ${expenseCountLabel(summary.owedExpenseCount)} pendiente${summary.owedExpenseCount === 1 ? "" : "s"}.`
								: allClear
									? "Todo está al día por ahora."
									: "Tus pagos están al día."}
						</p>
						{summary.owedExpenseCount ? (
							<Link
								className="bg-accent text-accent-foreground hover:bg-accent-strong mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold transition"
								href="/expenses?pending=mine"
							>
								Ver lo que debes
							</Link>
						) : null}
					</div>
				</div>
				<div className="bg-paper-strong/55 flex min-w-0 flex-col justify-between p-6 sm:p-8">
					<div className="min-w-0">
						<p className="text-positive-strong flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
							<ArrowDownLeft aria-hidden size={16} /> Te deben
						</p>
						<p className="font-display mt-4 max-w-full text-[clamp(1.75rem,8vw,1.875rem)] leading-tight font-semibold [overflow-wrap:anywhere]">
							{formatMoney(summary.amountDueToMeMinor)}
						</p>
						<p className="text-ink-muted mt-2 text-sm leading-6">
							{summary.dueToMeExpenseCount
								? `${expenseCountLabel(summary.dueToMeExpenseCount)} por cobrar.`
								: "No tienes reembolsos por cobrar."}
						</p>
					</div>
					{summary.dueToMeExpenseCount ? (
						<Link
							className="text-positive-strong decoration-positive/30 mt-6 text-sm font-semibold underline underline-offset-4"
							href={`/expenses?payer=${summary.participantId}&pending=true`}
						>
							Ver lo que te deben
						</Link>
					) : null}
				</div>
			</div>
		</section>
	);
}
