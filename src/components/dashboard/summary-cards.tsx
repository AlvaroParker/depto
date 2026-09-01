import { ArrowUpRight, ReceiptText, UsersRound } from "lucide-react";
import { formatMoney } from "@/lib/util/format";

export function SummaryCards({
	expenseCount,
	pendingTotalMinor,
	totalAmountMinor,
}: {
	expenseCount: number;
	pendingTotalMinor: number;
	totalAmountMinor: number;
}) {
	const items = [
		{ icon: ReceiptText, label: "Gastos registrados", value: String(expenseCount) },
		{ icon: ArrowUpRight, label: "Total compartido", value: formatMoney(totalAmountMinor) },
		{ icon: UsersRound, label: "Pendiente", value: formatMoney(pendingTotalMinor) },
	];
	return (
		<div className="mt-9 grid min-w-0 gap-4 sm:grid-cols-3">
			{items.map(({ icon: Icon, label, value }) => (
				<div className="border-line bg-paper/80 min-w-0 rounded-3xl border p-5" key={label}>
					<div className="text-ink-muted flex items-center justify-between">
						<span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
						<Icon aria-hidden size={18} />
					</div>
					<p className="font-display mt-6 max-w-full text-3xl leading-tight font-semibold [overflow-wrap:anywhere]">
						{value}
					</p>
				</div>
			))}
		</div>
	);
}
