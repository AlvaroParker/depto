import type { ParticipantBalance } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

export function BalanceList({ balances }: { balances: ParticipantBalance[] }) {
	return (
		<section className="border-line bg-paper rounded-3xl border p-5 sm:p-6">
			<h2 className="font-display text-2xl font-semibold">Balance por persona</h2>
			<p className="text-ink-muted mt-1 text-sm leading-5">
				Saldo pendiente después de considerar los reembolsos pagados.
			</p>
			<ul className="mt-5 grid gap-2.5">
				{balances.map((balance) => (
					<li
						className="border-line bg-paper-strong/55 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border px-4 py-3.5"
						key={balance.participant.id}
					>
						<div>
							<p className="font-semibold">{balance.participant.name}</p>
							<p
								className={`mt-0.5 text-xs font-medium ${
									balance.netBalanceMinor > 0
										? "text-positive-strong"
										: balance.netBalanceMinor < 0
											? "text-danger"
											: "text-ink-muted"
								}`}
							>
								{balance.netBalanceMinor > 0
									? "Saldo a favor"
									: balance.netBalanceMinor < 0
										? "Debe"
										: "Sin deuda"}
							</p>
						</div>
						<strong
							className={`text-lg ${
								balance.netBalanceMinor > 0
									? "text-positive-strong"
									: balance.netBalanceMinor < 0
										? "text-danger"
										: "text-ink-muted"
							}`}
						>
							{balance.netBalanceMinor > 0 ? "+" : ""}
							{formatMoney(balance.netBalanceMinor)}
						</strong>
					</li>
				))}
			</ul>
		</section>
	);
}
