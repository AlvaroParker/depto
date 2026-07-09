import { ArrowUpRight, ReceiptText, UsersRound } from "lucide-react";

export default function DashboardPage() {
	return (
		<main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
					Resumen del hogar
				</p>
				<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
					Todo en orden, de un vistazo.
				</h1>
				<p className="text-ink-muted mt-3 max-w-xl text-sm leading-6">
					Aquí aparecerán los gastos, saldos y reembolsos pendientes de la casa.
				</p>
				<div className="mt-9 grid gap-4 sm:grid-cols-3">
					{[
						{ icon: ReceiptText, label: "Gastos registrados", value: "0" },
						{ icon: ArrowUpRight, label: "Total compartido", value: "$0" },
						{ icon: UsersRound, label: "Pendiente", value: "$0" },
					].map(({ icon: Icon, label, value }) => (
						<div className="border-line bg-paper/80 rounded-3xl border p-5" key={label}>
							<div className="text-ink-muted flex items-center justify-between">
								<span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
								<Icon aria-hidden size={18} />
							</div>
							<p className="font-display mt-6 text-3xl font-semibold">{value}</p>
						</div>
					))}
				</div>
			</div>
		</main>
	);
}
