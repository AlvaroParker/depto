import { Scale, WalletCards } from "lucide-react";
import type { PersonalDashboardSummary } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

export function PersonalSummaryCards({ summary }: { summary: PersonalDashboardSummary }) {
	const items = [
		{
			description: "Lo que salió de tu bolsillo, considerando los reembolsos completados.",
			icon: WalletCards,
			label: "Gastado hasta hoy",
			value: formatMoney(summary.spentSoFarMinor),
		},
		{
			description: "Tu parte acumulada si todos los pagos pendientes se completaran hoy.",
			icon: Scale,
			label: "Tu gasto total",
			value: formatMoney(summary.expectedSpendMinor),
		},
	];
	return (
		<div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
			{items.map(({ description, icon: Icon, label, value }) => (
				<div className="border-line bg-paper/80 min-w-0 rounded-3xl border p-5 sm:p-6" key={label}>
					<div className="text-ink-muted flex items-center justify-between">
						<span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
						<span className="bg-paper-strong grid size-9 place-items-center rounded-full">
							<Icon aria-hidden size={17} />
						</span>
					</div>
					<p className="font-display mt-5 max-w-full text-3xl leading-tight font-semibold [overflow-wrap:anywhere]">
						{value}
					</p>
					<p className="text-ink-muted mt-2 max-w-md text-xs leading-5">{description}</p>
				</div>
			))}
		</div>
	);
}
