import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { PersonalDebtByParticipant } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

function DebtAmounts({ debt }: { debt: PersonalDebtByParticipant }) {
	return (
		<div className="grid shrink-0 gap-1.5 text-right">
			{debt.amountOwedMinor ? (
				<p className="text-pending-strong flex items-center justify-end gap-1.5 text-xs font-semibold">
					<ArrowUpRight aria-hidden size={13} /> Debes {formatMoney(debt.amountOwedMinor)}
				</p>
			) : null}
			{debt.amountDueToMeMinor ? (
				<p className="text-positive-strong flex items-center justify-end gap-1.5 text-xs font-semibold">
					<ArrowDownLeft aria-hidden size={13} /> Te debe {formatMoney(debt.amountDueToMeMinor)}
				</p>
			) : null}
		</div>
	);
}

export function PersonalDebtOverview({ debts }: { debts: PersonalDebtByParticipant[] }) {
	return (
		<section className="border-line bg-paper mt-4 overflow-hidden rounded-3xl border">
			<header className="border-line border-b px-5 py-4 sm:px-6">
				<h2 className="font-display text-2xl font-semibold">Deudas por persona</h2>
				<p className="text-ink-muted mt-1 text-sm">Tus saldos activos, de mayor a menor.</p>
			</header>
			{debts.length ? (
				<ul
					aria-label="Resumen de deudas por persona"
					className="divide-line max-h-72 [scrollbar-gutter:stable] divide-y overflow-y-auto overscroll-contain"
				>
					{debts.map((debt) => (
						<li
							className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
							key={debt.participant.id}
						>
							<div className="flex min-w-0 items-center gap-3">
								<span
									aria-hidden
									className="bg-paper-strong text-ink-muted grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold uppercase"
								>
									{debt.participant.name.slice(0, 1)}
								</span>
								<p className="truncate font-semibold">{debt.participant.name}</p>
							</div>
							<DebtAmounts debt={debt} />
						</li>
					))}
				</ul>
			) : (
				<div className="text-ink-muted flex items-center gap-3 px-5 py-6 text-sm sm:px-6">
					<span className="bg-positive/10 text-positive-strong grid size-9 place-items-center rounded-full">
						<CheckCircle2 aria-hidden size={17} />
					</span>
					No hay deudas activas con otras personas.
				</div>
			)}
		</section>
	);
}
